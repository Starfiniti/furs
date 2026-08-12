import assert from 'node:assert/strict';
import test from 'node:test';

import { runFursLoadEvidence } from './run-furs-load-evidence.mjs';

test('FURS-ID-002/REL-001: load evidence proves unique documents and identities', async () => {
  const entity = '019ff57a-f30d-7290-9bb9-951bed760901';
  const scenarioText = JSON.stringify({
    environment: 'test', reviewedBy: 'compliance-reviewer', policyVersion: 'load-v1', expectedTerminalStatus: 'CONFIRMED',
    sourceVersion: { technicalDocumentation: '3.2', schemaSha256: 'a'.repeat(64) },
    request: { legalEntityId: entity, kind: 'STANDARD', subsequentSubmit: false }
  });
  let sequence = 0;
  const messageIds = new Set();
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/v1/system/info')) return Response.json({ environment: 'test', legalEntityId: entity });
    if (path.endsWith('/v1/furs/echo')) return Response.json({ value: JSON.parse(init.body).value });
    if (path.endsWith('/v1/fiscal-invoices') && init.method === 'POST') {
      const request = JSON.parse(init.body); messageIds.add(request.messageId); const current = ++sequence;
      return Response.json({
        id: `019ff57a-f30d-7290-9bb9-${String(current).padStart(12, '0')}`, status: 'CONFIRMED',
        businessPremiseId: 'P1', electronicDeviceId: 'D1', invoiceSequence: String(current)
      });
    }
    throw new Error(`Unexpected request ${path}`);
  };
  const evidence = await runFursLoadEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'), baseUrl: 'http://127.0.0.1:8080',
    confirmation: 'furs-test-load-approved', total: 6, concurrency: 3, fetch, sleep: async () => {}
  });
  assert.equal(evidence.uniqueDocuments, 6);
  assert.equal(evidence.uniqueFiscalIdentities, 6);
  assert.equal(messageIds.size, 6);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/);
});

test('FURS-REL-001: load runner requires explicit approval', async () => {
  await assert.rejects(runFursLoadEvidence({ scenarioText: '{}', confirmation: 'wrong' }), (error) => error.code === 'FURS_LOAD_GUARD');
});
