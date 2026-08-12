const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/u;
const PLACEHOLDER = /(?:pending|replace|example|todo|tbd|unknown)/iu;

export const REQUIRED_FURS_OPERATIONS = Object.freeze([
  'ECHO_STRICT_MTLS',
  'PREMISE_REGISTER',
  'PREMISE_UPDATE',
  'PREMISE_CLOSE',
  'INVOICE_STANDARD',
  'INVOICE_REJECTION',
  'INVOICE_CORRECTION',
  'SUBSEQUENT_SUBMISSION',
  'FOREIGN_OPERATOR',
  'SELF_SERVICE_OPERATOR'
]);

export const REQUIRED_REPORTS = Object.freeze([
  'furs', 'postgres', 'restore', 'rotation', 'load', 'soak',
  'networkOutageDrill', 'deviceFailureDrill', 'alerts', 'container'
]);

export const REQUIRED_APPROVALS = Object.freeze([
  'cryptographyReview', 'securityReview', 'accountingReview',
  'privacyReview', 'complianceAcceptance'
]);

export class ReleaseEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReleaseEvidenceError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new ReleaseEvidenceError(code, message);
}

function record(value, code, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) reject(code, `${label} must be an object`);
  return value;
}

function text(value, code, label, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) reject(code, `${label} is invalid`);
  return value;
}

function reviewer(value, code, label) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 200 || PLACEHOLDER.test(value)) {
    reject(code, `${label} must name an actual reviewer`);
  }
}

function reviewedEvidence(value, code, label) {
  const evidence = record(value, code, label);
  text(evidence.sha256, code, `${label}.sha256`, SHA256);
  reviewer(evidence.reviewedBy, code, `${label}.reviewedBy`);
  text(evidence.reviewedAt, code, `${label}.reviewedAt`, DATE);
  return evidence;
}

function approval(value, key) {
  const item = reviewedEvidence(value, 'FURS_RELEASE_APPROVAL', `approvals.${key}`);
  if (item.approved !== true) reject('FURS_RELEASE_APPROVAL', `approvals.${key} must be explicitly approved`);
}

export function parseReleaseEvidence(textValue) {
  let value;
  try {
    value = JSON.parse(textValue);
  } catch {
    reject('FURS_RELEASE_JSON', 'Release evidence manifest is not valid JSON');
  }
  return record(value, 'FURS_RELEASE_SHAPE', 'Release evidence manifest');
}

export function validateReleaseEvidence(value, context) {
  const manifest = record(value, 'FURS_RELEASE_SHAPE', 'Release evidence manifest');
  if (manifest.version !== 1) reject('FURS_RELEASE_VERSION', 'Release evidence version must be 1');
  text(manifest.releaseId, 'FURS_RELEASE_ID', 'releaseId', RELEASE_ID);
  text(manifest.commitSha, 'FURS_RELEASE_COMMIT', 'commitSha', COMMIT_SHA);
  if (manifest.commitSha !== context.currentCommitSha) reject('FURS_RELEASE_COMMIT', 'Evidence commit does not match checked-out HEAD');
  if (manifest.environment !== 'test') reject('FURS_RELEASE_ENVIRONMENT', 'Release evidence must originate in the FURS test environment');
  text(manifest.legalEntityId, 'FURS_RELEASE_ENTITY', 'legalEntityId', UUID);

  const sourceReview = reviewedEvidence(manifest.sourceReview, 'FURS_RELEASE_SOURCE', 'sourceReview');
  text(sourceReview.snapshotSha256, 'FURS_RELEASE_SOURCE', 'sourceReview.snapshotSha256', SHA256);
  if (!Array.isArray(sourceReview.unresolvedSourceChanges) || sourceReview.unresolvedSourceChanges.length !== 0) {
    reject('FURS_RELEASE_SOURCE', 'All official source changes must be resolved before release');
  }

  const reports = record(manifest.reports, 'FURS_RELEASE_REPORT', 'reports');
  for (const key of REQUIRED_REPORTS) reviewedEvidence(reports[key], 'FURS_RELEASE_REPORT', `reports.${key}`);

  if (!Array.isArray(reports.furs.operations)) reject('FURS_RELEASE_FURS', 'reports.furs.operations must be an array');
  for (const operation of REQUIRED_FURS_OPERATIONS) {
    if (!reports.furs.operations.includes(operation)) reject('FURS_RELEASE_FURS', `Missing official FURS operation evidence: ${operation}`);
  }
  if (reports.furs.environment !== 'test') reject('FURS_RELEASE_FURS', 'FURS report must identify the test environment');
  if (reports.postgres.majorVersion !== 17) reject('FURS_RELEASE_POSTGRES', 'PostgreSQL evidence must run against major version 17');
  if (reports.restore.pitrVerified !== true || reports.restore.sequenceHighWaterVerified !== true) {
    reject('FURS_RELEASE_RESTORE', 'Restore evidence must prove PITR and sequence high-water reconciliation');
  }
  if (reports.rotation.clientCertificateVerified !== true || reports.rotation.trustChainVerified !== true) {
    reject('FURS_RELEASE_ROTATION', 'Rotation evidence must cover client certificate and trust chain');
  }
  if (
    typeof reports.load.expectedPeakPerSecond !== 'number' || reports.load.expectedPeakPerSecond <= 0 ||
    typeof reports.load.achievedPerSecond !== 'number' ||
    reports.load.achievedPerSecond < reports.load.expectedPeakPerSecond * 3 ||
    reports.load.duplicateIdentities !== 0
  ) {
    reject('FURS_RELEASE_LOAD', 'Load evidence must reach 3x expected peak with zero duplicate identities');
  }
  if (typeof reports.soak.durationHours !== 'number' || reports.soak.durationHours < 48 || reports.soak.failures !== 0) {
    reject('FURS_RELEASE_SOAK', 'Soak evidence must cover at least 48 hours with zero failures');
  }
  if (reports.networkOutageDrill.subsequentSubmissionVerified !== true) {
    reject('FURS_RELEASE_OUTAGE', 'Network-outage drill must prove subsequent submission');
  }
  if (reports.deviceFailureDrill.vkrBoundaryVerified !== true) {
    reject('FURS_RELEASE_DEVICE', 'Device-failure drill must prove the VKR/operator boundary');
  }
  const requiredAlerts = ['certificateExpiry', 'clockDrift', 'retryBacklog', 'manualReview', 'workerHeartbeat'];
  if (!Array.isArray(reports.alerts.fired) || requiredAlerts.some((alert) => !reports.alerts.fired.includes(alert))) {
    reject('FURS_RELEASE_ALERTS', 'Alert evidence is incomplete');
  }
  text(reports.container.sbomSha256, 'FURS_RELEASE_CONTAINER', 'reports.container.sbomSha256', SHA256);
  if (
    reports.container.unresolvedHigh !== 0 || reports.container.unresolvedCritical !== 0 ||
    typeof reports.container.workflowUrl !== 'string' ||
    !/^https:\/\/github\.com\/Starfiniti\/furs\/actions\/runs\/\d+(?:\/.*)?$/u.test(reports.container.workflowUrl)
  ) {
    reject('FURS_RELEASE_CONTAINER', 'Container evidence must be a green repository workflow with no unresolved HIGH/CRITICAL findings');
  }

  const approvals = record(manifest.approvals, 'FURS_RELEASE_APPROVAL', 'approvals');
  for (const key of REQUIRED_APPROVALS) approval(approvals[key], key);

  const license = reviewedEvidence(manifest.license, 'FURS_RELEASE_LICENSE', 'license');
  if (license.approved !== true || typeof license.spdx !== 'string' || !/^[A-Za-z0-9-.+]{3,50}$/u.test(license.spdx)) {
    reject('FURS_RELEASE_LICENSE', 'Final SPDX license must be explicitly approved');
  }
  if (!context.hasLicenseFile || context.packageLicense !== license.spdx || context.packageLicense === 'UNLICENSED') {
    reject('FURS_RELEASE_LICENSE', 'Approved license must match package.json and a repository LICENSE file');
  }

  return Object.freeze({
    releaseId: manifest.releaseId,
    commitSha: manifest.commitSha,
    reportCount: REQUIRED_REPORTS.length,
    approvalCount: REQUIRED_APPROVALS.length
  });
}
