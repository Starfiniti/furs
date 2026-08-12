import assert from 'node:assert/strict';
import test from 'node:test';

import { runCertificateRotationEvidence } from './run-certificate-rotation-evidence.mjs';

test('FURS-CERT-001: rotation evidence requires distinct certificate with later validity', async () => {
  const results = [
    { fingerprint256: 'AA:BB', validFrom: new Date('2026-01-01Z'), validTo: new Date('2026-09-01Z'), echo: 'verified', serverDateObserved: true },
    { fingerprint256: 'CC:DD', validFrom: new Date('2026-08-01Z'), validTo: new Date('2027-09-01Z'), echo: 'verified', serverDateObserved: true }
  ];
  const evidence = await runCertificateRotationEvidence({
    environment: 'test', oldCertificate: {}, newCertificate: {}, probe: async () => results.shift()
  });
  assert.equal(evidence.distinctCertificate, true);
  assert.equal(evidence.replacementExtendsValidity, true);
  assert.equal(JSON.stringify(evidence).includes('AA:BB'), false);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/);
});

test('FURS-CERT-001: rotation evidence refuses production', async () => {
  await assert.rejects(runCertificateRotationEvidence({ environment: 'production' }), (error) => error.code === 'FURS_ROTATION_ENVIRONMENT');
});
