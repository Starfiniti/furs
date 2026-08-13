import assert from 'node:assert/strict';
import test from 'node:test';

import { runFursSoak } from './run-furs-soak.mjs';

test('FURS-REL-001: soak runner creates fresh identities and a chained redacted summary', async () => {
  const scenarioText = JSON.stringify({
    environment: 'test', scenarioId: 'representative', legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760901',
    sourceVersion: { technicalDocumentation: '3.2', schemaSha256: 'a'.repeat(64) },
    operations: [{
      kind: 'fiscal-invoice', idempotencyKey: 'soak:invoice', expectedTerminalStatus: 'CONFIRMED', repeatEachCycle: true,
      request: { messageId: 'old', issueLocalTime: 'old' }
    }]
  });
  const observed = [];
  let tick = 0;
  const start = new Date('2026-08-12T10:00:00Z');
  const evidence = await runFursSoak({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'), baseUrl: 'http://127.0.0.1:8080',
    durationMs: 10_000, intervalMs: 1_000, maximumCycles: 2,
    now: () => new Date(start.getTime() + tick++ * 1_000), sleep: async () => {},
    runCycle: async ({ scenarioText: cycleText }) => {
      const scenario = JSON.parse(cycleText); observed.push(scenario);
      return { operations: [{ status: 'CONFIRMED' }], scenarioSha256: 'b'.repeat(64) };
    }
  });
  assert.equal(evidence.cycles, 2);
  assert.equal(evidence.operations, 2);
  assert.equal(evidence.failures, 0);
  assert.equal(typeof evidence.durationHours, 'number');
  assert.equal(evidence.completedRequestedDuration, false);
  assert.match(evidence.evidenceChainSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(observed[0].operations[0].request.messageId, observed[1].operations[0].request.messageId);
  assert.notEqual(observed[0].operations[0].idempotencyKey, observed[1].operations[0].idempotencyKey);
  assert.match(observed[0].operations[0].request.issueLocalTime, /^2026-08-12T12:/);
});
