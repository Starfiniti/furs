import assert from 'node:assert/strict';
import test from 'node:test';

import { runFursLoadEvidence } from './run-furs-load-evidence.mjs';

test('FURS-ID-002/REL-001: load evidence proves unique documents and identities', async () => {
  const entity = '019ff57a-f30d-7290-9bb9-951bed760901';
  const scenarioText = JSON.stringify({
    environment: 'test', reviewedBy: 'compliance-reviewer', policyVersion: 'load-v1', expectedTerminalStatus: 'CONFIRMED', expectedPeakPerSecond: 0.5,
    sourceVersion: {
      technicalDocumentation: '3.2',
      technicalDocumentationSha256: '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547',
      schemaSha256: '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd'
    },
    request: { legalEntityId: entity, kind: 'STANDARD', subsequentSubmit: false }
  });
  let sequence = 0;
  const messageIds = new Set();
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/v1/system/info')) return Response.json({ environment: 'test', legalEntityId: entity, apiMaximumRequestsPerMinute: 100000 });
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
  let milliseconds = 0;
  const evidence = await runFursLoadEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'), baseUrl: 'http://127.0.0.1:8080',
    confirmation: 'furs-test-load-approved', total: 6, concurrency: 3, fetch, sleep: async () => {},
    nowMilliseconds: () => milliseconds += 100
  });
  assert.equal(evidence.uniqueDocuments, 6);
  assert.equal(evidence.uniqueFiscalIdentities, 6);
  assert.equal(messageIds.size, 7);
  assert.equal(evidence.duplicateIdentities, 0);
  assert.equal(evidence.expectedPeakPerSecond, 0.5);
  assert.ok(evidence.achievedPerSecond >= 1.5);
  assert.equal(evidence.targetAchieved, true);
  assert.equal(evidence.submissionPreflightConfirmed, true);
  assert.match(evidence.scenarioSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/);
});

test('FURS-REL-001: load evidence reports an insufficient 3x throughput target', async () => {
  const entity = '019ff57a-f30d-7290-9bb9-951bed760901';
  const scenarioText = JSON.stringify({
    environment: 'test', reviewedBy: 'compliance-reviewer', policyVersion: 'load-slow-v1',
    expectedTerminalStatus: 'CONFIRMED', expectedPeakPerSecond: 10,
    sourceVersion: {
      technicalDocumentation: '3.2',
      technicalDocumentationSha256: '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547',
      schemaSha256: '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd'
    },
    request: { legalEntityId: entity, kind: 'STANDARD' }
  });
  let milliseconds = 0;
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/v1/system/info')) return Response.json({ environment: 'test', legalEntityId: entity, apiMaximumRequestsPerMinute: 100000 });
    if (path.endsWith('/v1/furs/echo')) return Response.json({ value: JSON.parse(init.body).value });
    return Response.json({
      id: '019ff57a-f30d-7290-9bb9-951bed760999', status: 'CONFIRMED',
      businessPremiseId: 'P1', electronicDeviceId: 'D1', invoiceSequence: '1'
    });
  };
  const evidence = await runFursLoadEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'),
    baseUrl: 'http://127.0.0.1:8080', confirmation: 'furs-test-load-approved', total: 1,
    concurrency: 1, fetch, sleep: async () => {}, nowMilliseconds: () => milliseconds += 1000
  });
  assert.equal(evidence.targetAchieved, false);
  assert.ok(evidence.achievedPerSecond < evidence.requiredPerSecond);
});

test('FURS-REL-001: load runner requires explicit approval', async () => {
  await assert.rejects(runFursLoadEvidence({ scenarioText: '{}', confirmation: 'wrong' }), (error) => error.code === 'FURS_LOAD_GUARD');
});

test('FURS-SEC-002/REL-001: API rate limit must cover commands and result polling at the target', async () => {
  const entity = '019ff57a-f30d-7290-9bb9-951bed760901';
  const scenarioText = JSON.stringify({
    environment: 'test', reviewedBy: 'Dejan Kletečki', policyVersion: 'starfiniti-v1-2026-08-13',
    expectedTerminalStatus: 'CONFIRMED', expectedPeakPerSecond: 60,
    sourceVersion: {
      technicalDocumentation: '3.2',
      technicalDocumentationSha256: '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547',
      schemaSha256: '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd'
    },
    request: { legalEntityId: entity, kind: 'STANDARD' }
  });
  await assert.rejects(runFursLoadEvidence({
    scenarioText, token: ['test', 'write', 'credential', 'minimum', 'length'].join('-'),
    baseUrl: 'http://127.0.0.1:8080', confirmation: 'furs-test-load-approved', total: 1,
    concurrency: 1, fetch: async () => Response.json({
      environment: 'test', legalEntityId: entity, apiMaximumRequestsPerMinute: 21_599
    })
  }), (error) => error.code === 'FURS_LOAD_RATE_LIMIT');
});
