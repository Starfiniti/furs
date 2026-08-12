import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  REQUIRED_APPROVALS,
  REQUIRED_FURS_OPERATIONS,
  REQUIRED_REPORTS,
  ReleaseEvidenceError,
  parseReleaseEvidence,
  validateReleaseEvidence
} from './release-evidence-policy.mjs';

const hash = (character) => character.repeat(64);
const evidence = (extra = {}) => ({ sha256: hash('a'), reviewedBy: 'Dejan Reviewer', reviewedAt: '2026-08-12', ...extra });

function validManifest() {
  return {
    version: 1,
    releaseId: 'v1.0.0-rc.1',
    commitSha: 'b'.repeat(40),
    environment: 'test',
    legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760201',
    sourceReview: evidence({ snapshotSha256: hash('b'), unresolvedSourceChanges: [] }),
    reports: {
      furs: evidence({ environment: 'test', operations: [...REQUIRED_FURS_OPERATIONS] }),
      postgres: evidence({ majorVersion: 17 }),
      restore: evidence({ pitrVerified: true, sequenceHighWaterVerified: true }),
      rotation: evidence({ clientCertificateVerified: true, trustChainVerified: true }),
      load: evidence({ expectedPeakPerSecond: 10, achievedPerSecond: 30, duplicateIdentities: 0 }),
      soak: evidence({ durationHours: 48, failures: 0 }),
      networkOutageDrill: evidence({ subsequentSubmissionVerified: true }),
      deviceFailureDrill: evidence({ vkrBoundaryVerified: true }),
      alerts: evidence({ fired: ['certificateExpiry', 'clockDrift', 'retryBacklog', 'manualReview', 'workerHeartbeat'] }),
      container: evidence({
        sbomSha256: hash('c'), unresolvedHigh: 0, unresolvedCritical: 0,
        workflowUrl: 'https://github.com/Starfiniti/furs/actions/runs/123456789'
      })
    },
    approvals: Object.fromEntries(REQUIRED_APPROVALS.map((key) => [key, evidence({ approved: true })])),
    license: evidence({ approved: true, spdx: 'Apache-2.0' })
  };
}

const context = { currentCommitSha: 'b'.repeat(40), hasLicenseFile: true, packageLicense: 'Apache-2.0' };

test('FURS-REL-001: complete named and hashed P0-P7 evidence is accepted', () => {
  const result = validateReleaseEvidence(validManifest(), context);
  assert.deepEqual(result, {
    releaseId: 'v1.0.0-rc.1', commitSha: 'b'.repeat(40),
    reportCount: REQUIRED_REPORTS.length, approvalCount: REQUIRED_APPROVALS.length
  });
  assert.deepEqual(parseReleaseEvidence(JSON.stringify(validManifest())), validManifest());
});

test('FURS-REL-001/SRC-001: unresolved sources and missing FURS paths fail closed', () => {
  const source = validManifest();
  source.sourceReview.unresolvedSourceChanges = ['spot-online-retail'];
  assert.throws(() => validateReleaseEvidence(source, context), (error) => error instanceof ReleaseEvidenceError && error.code === 'FURS_RELEASE_SOURCE');
  const furs = validManifest();
  furs.reports.furs.operations = furs.reports.furs.operations.filter((value) => value !== 'INVOICE_CORRECTION');
  assert.throws(() => validateReleaseEvidence(furs, context), /INVOICE_CORRECTION/u);
});

test('FURS-REL-001: production-labelled, insufficient load or short soak evidence is rejected', () => {
  const production = validManifest();
  production.environment = 'production';
  assert.throws(() => validateReleaseEvidence(production, context), /test environment/u);
  const load = validManifest();
  load.reports.load.achievedPerSecond = 29.99;
  assert.throws(() => validateReleaseEvidence(load, context), /3x expected peak/u);
  const soak = validManifest();
  soak.reports.soak.durationHours = 47.99;
  assert.throws(() => validateReleaseEvidence(soak, context), /48 hours/u);
});

test('FURS-REL-001: placeholders, commit mismatch and an unapproved license fail closed', () => {
  const placeholder = validManifest();
  placeholder.approvals.securityReview.reviewedBy = 'pending reviewer';
  assert.throws(() => validateReleaseEvidence(placeholder, context), /actual reviewer/u);
  const mismatch = validManifest();
  assert.throws(() => validateReleaseEvidence(mismatch, { ...context, currentCommitSha: 'd'.repeat(40) }), /checked-out HEAD/u);
  assert.throws(() => validateReleaseEvidence(validManifest(), { ...context, hasLicenseFile: false }), /repository LICENSE/u);
});

test('FURS-REL-001: the checked-in evidence template cannot be mistaken for approval', async () => {
  const template = parseReleaseEvidence(await readFile(new URL('../templates/release-evidence-manifest.example.json', import.meta.url), 'utf8'));
  assert.throws(() => validateReleaseEvidence(template, context), ReleaseEvidenceError);
});
