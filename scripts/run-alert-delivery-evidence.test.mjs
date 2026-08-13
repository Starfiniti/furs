import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  REQUIRED_ALERT_NAMES,
  assertExecutableDigest,
  assertExternalEvidenceDirectory,
  buildAlertmanagerConfig,
  summarizeAlertDelivery
} from './run-alert-delivery-evidence.mjs';

const hash = 'a'.repeat(64);

test('FURS-REL-001: evidence stays outside Git and the executable digest is pinned', () => {
  assert.throws(
    () => assertExternalEvidenceDirectory(process.cwd(), process.cwd()),
    (error) => error.code === 'FURS_ALERT_EVIDENCE_PATH'
  );
  assert.doesNotThrow(() => assertExternalEvidenceDirectory(process.cwd(), resolve(process.cwd(), '..', 'protected-alert-evidence')));
  assert.doesNotThrow(() => assertExecutableDigest(hash, hash));
  assert.throws(
    () => assertExecutableDigest(hash, 'b'.repeat(64)),
    (error) => error.code === 'FURS_ALERT_EXECUTABLE_CHANGED'
  );
});

test('FURS-REL-001: Alertmanager evidence config is restricted to a loopback webhook', () => {
  const config = buildAlertmanagerConfig('http://127.0.0.1:48123/alerts');
  assert.match(config, /receiver: evidence-webhook/u);
  assert.match(config, /http:\/\/127\.0\.0\.1:48123\/alerts/u);
  assert.throws(
    () => buildAlertmanagerConfig('https://alerts.example.test/receiver'),
    (error) => error.code === 'FURS_ALERT_WEBHOOK'
  );
});

test('FURS-REL-001: delivery evidence requires every release alert category', () => {
  const evidence = summarizeAlertDelivery({
    environment: 'test',
    generatedAt: '2026-08-13T10:30:00.000Z',
    alertmanagerVersion: '0.32.1',
    executableSha256: hash,
    receivedAlertNames: [...REQUIRED_ALERT_NAMES, REQUIRED_ALERT_NAMES[0]],
    deliveriesObserved: 5,
    deliveryLatencyMilliseconds: 25
  });
  assert.equal(evidence.allRequiredDelivered, true);
  assert.equal(evidence.productionRoutingVerified, false);
  assert.deepEqual(evidence.fired, ['certificateExpiry', 'clockDrift', 'manualReview', 'retryBacklog', 'workerHeartbeat']);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test('FURS-REL-001: incomplete alert routing cannot become release evidence', () => {
  assert.throws(
    () => summarizeAlertDelivery({
      environment: 'test',
      generatedAt: '2026-08-13T10:30:00.000Z',
      alertmanagerVersion: '0.32.1',
      executableSha256: hash,
      receivedAlertNames: REQUIRED_ALERT_NAMES.slice(1),
      deliveriesObserved: 4,
      deliveryLatencyMilliseconds: 25
    }),
    (error) => error.code === 'FURS_ALERT_MISSING'
  );
});
