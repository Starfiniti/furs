import assert from 'node:assert/strict';
import test from 'node:test';

import { runFursEvidence } from './run-furs-evidence.mjs';

test('FURS-REL-001: evidence runner proves test environment and emits only redacted results', async () => {
  const entity = '019ff57a-f30d-7290-9bb9-951bed760901';
  const scenarioText = JSON.stringify({
    environment: 'test', scenarioId: 'basic-confirmation', legalEntityId: entity,
    sourceVersion: { technicalDocumentation: '3.2', schemaSha256: 'a'.repeat(64) },
    operations: [{
      kind: 'fiscal-invoice', idempotencyKey: 'evidence:invoice:one', expectedTerminalStatus: 'CONFIRMED',
      request: { taxNumber: 'sensitive-not-for-output' }
    }]
  });
  const responses = [
    { environment: 'test', legalEntityId: entity },
    { value: 'ECHO' },
    { id: '019ff57a-f30d-7290-9bb9-951bed760902', status: 'READY' },
    {
      id: '019ff57a-f30d-7290-9bb9-951bed760902', status: 'CONFIRMED', payloadSha256: 'b'.repeat(64),
      zoi: 'c'.repeat(32), eor: '4e64a93a-40fa-4c02-afb1-488534b85e4d',
      issueLocalTime: '2026-08-12T12:34:56', confirmedAt: '2026-08-12T10:34:57.000Z'
    }
  ];
  let echoRequest;
  const fetch = async (_url, init) => {
    const next = responses.shift();
    if (init.body?.includes('evidence-')) {
      echoRequest = JSON.parse(init.body).value;
      next.value = echoRequest;
    }
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const evidence = await runFursEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'),
    baseUrl: 'http://127.0.0.1:8080/', fetch, sleep: async () => {}, pollIntervalMs: 0
  });
  assert.equal(evidence.echo, 'verified');
  assert.equal(evidence.operations[0].status, 'CONFIRMED');
  const text = JSON.stringify(evidence);
  assert.equal(text.includes('sensitive-not-for-output'), false);
  assert.equal(text.includes('cccccccccccccccccccccccccccccccc'), false);
  assert.equal(text.includes('4e64a93a-40fa-4c02-afb1-488534b85e4d'), false);
  assert.ok(echoRequest.startsWith('evidence-'));
});

test('FURS-REL-001: evidence runner refuses a production-configured API', async () => {
  const scenarioText = JSON.stringify({
    environment: 'test', scenarioId: 'blocked-production', legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760901',
    sourceVersion: { technicalDocumentation: '3.2', schemaSha256: 'a'.repeat(64) }, operations: []
  });
  await assert.rejects(runFursEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'), baseUrl: 'https://api.example.test/',
    fetch: async () => new Response(JSON.stringify({ environment: 'production', legalEntityId: 'x' }), { status: 200 })
  }), (error) => error.code === 'FURS_EVIDENCE_ENVIRONMENT');
});
