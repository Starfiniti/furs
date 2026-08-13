import assert from 'node:assert/strict';
import test from 'node:test';

import { runLocalTransportCapacityEvidence } from './run-local-transport-capacity-evidence.mjs';

test('FURS-TLS-001/002/REL-001: local capacity evidence is bounded and cannot contact FURS', async () => {
  const evidence = await runLocalTransportCapacityEvidence({
    totalRequests: 40,
    concurrency: 20,
    maximumSockets: 4,
    requiredThroughput: 1
  });
  assert.equal(evidence.localOnly, true);
  assert.equal(evidence.fursEndpointContacted, false);
  assert.equal(evidence.fixtureCertificatesOnly, true);
  assert.equal(evidence.totalRequests, 40);
  assert.equal(evidence.strictTlsVerified, true);
  assert.equal(evidence.socketBoundVerified, true);
  assert.equal(evidence.localCapacityGatePassed, true);
  assert.ok(evidence.secureConnections <= 4);
  assert.ok(evidence.uniqueConnections <= 4);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/);
});
