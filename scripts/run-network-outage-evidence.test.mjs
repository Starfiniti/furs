import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOutageScenario, prepareNetworkOutageEvidence, recoverNetworkOutageEvidence } from './run-network-outage-evidence.mjs';

const entity = '019ff57a-f30d-7290-9bb9-951bed760401';
const document = '019ff57a-f30d-7290-9bb9-951bed760402';
const message = '019ff57a-f30d-7290-9bb9-951bed760403';
const sourceVersion = {
  technicalDocumentation: '3.2',
  technicalDocumentationSha256: '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547',
  schemaSha256: '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd'
};
const scenario = {
  environment: 'test', scenarioId: 'outage-v1', legalEntityId: entity,
  sourceVersion,
  operation: { idempotencyKey: 'outage:test:one', request: { legalEntityId: entity, kind: 'STANDARD', subsequentSubmit: true, messageId: message } }
};

test('FURS-OUT-001/002: outage scenario requires an explicit subsequent submission', () => {
  assert.equal(parseOutageScenario(JSON.stringify(scenario)).operation.request.subsequentSubmit, true);
  assert.throws(
    () => parseOutageScenario(JSON.stringify({ ...scenario, operation: { ...scenario.operation, request: { ...scenario.operation.request, subsequentSubmit: false } } })),
    (error) => error.code === 'FURS_OUTAGE_SCENARIO'
  );
  assert.throws(
    () => parseOutageScenario(JSON.stringify({ ...scenario, sourceVersion: { ...sourceVersion, schemaSha256: 'a'.repeat(64) } })),
    (error) => error.code === 'FURS_OUTAGE_SOURCE'
  );
});

test('FURS-OUT-001: preparation proves a healthy worker retained an interrupted submission', async () => {
  const accepted = {
    id: document, status: 'ISSUED_WITHOUT_EOR', subsequentSubmit: true, invoiceSequence: '12',
    issueLocalTime: '2026-08-13T12:55:00', messageId: message, payloadSha256: 'b'.repeat(64),
    zoi: 'zoi-value', updatedAt: '2026-08-13T10:55:00.000Z'
  };
  const responses = [
    new Response(JSON.stringify({ environment: 'test', legalEntityId: entity })),
    new Response('starfiniti_furs_worker_heartbeat_age_seconds 1\nstarfiniti_furs_outbox_active 0\n'),
    new Response(JSON.stringify(accepted), { status: 202 }),
    new Response(JSON.stringify({ ...accepted, updatedAt: '2026-08-13T10:55:01.000Z' })),
    new Response('starfiniti_furs_worker_heartbeat_age_seconds 1\nstarfiniti_furs_outbox_active 1\n')
  ];
  const evidence = await prepareNetworkOutageEvidence({
    scenarioText: JSON.stringify(scenario), apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
    fetch: async () => responses.shift(), sleep: async () => undefined
  });
  assert.equal(evidence.state, 'connectivity-interrupted');
  assert.equal(evidence.original.documentId, document);
  assert.equal(evidence.activeOutboxJobs, 1);
  assert.equal(evidence.deviceSoftwareOperationalVerified, true);
});

test('FURS-OUT-001/002: recovery evidence requires the unchanged confirmed identity', async () => {
  const original = {
    documentId: document, invoiceSequence: '12', issueLocalTime: '2026-08-13T12:55:00', messageId: message,
    payloadSha256: 'b'.repeat(64), zoiSha256: 'c'.repeat(64), updatedAt: '2026-08-13T10:55:00.000Z'
  };
  const stateText = JSON.stringify({
    evidenceVersion: 1, environment: 'test', state: 'connectivity-interrupted', scenarioId: 'outage-v1',
    scenarioSha256: 'd'.repeat(64), sourceVersion: scenario.sourceVersion, original,
    connectivityInterruptionObserved: true, deviceSoftwareOperationalVerified: true
  });
  const responses = [
    new Response(JSON.stringify({ id: document, status: 'ISSUED_WITHOUT_EOR', messageId: message })),
    new Response('{"status":"accepted"}', { status: 202 }),
    new Response(JSON.stringify({
      id: document, status: 'CONFIRMED', subsequentSubmit: true, invoiceSequence: '12',
      issueLocalTime: original.issueLocalTime, messageId: message, payloadSha256: original.payloadSha256,
      zoi: 'zoi-value', eor: '019ff57a-f30d-7290-9bb9-951bed760404', updatedAt: '2026-08-13T10:56:00.000Z'
    })),
    new Response('starfiniti_furs_worker_heartbeat_age_seconds 1\nstarfiniti_furs_outbox_active 0\n')
  ];
  const state = JSON.parse(stateText);
  state.original.zoiSha256 = (await import('node:crypto')).createHash('sha256').update('zoi-value').digest('hex');
  const evidence = await recoverNetworkOutageEvidence({
    stateText: JSON.stringify(state), apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
    fetch: async () => responses.shift(), sleep: async () => undefined
  });
  assert.equal(evidence.finalStatus, 'CONFIRMED');
  assert.equal(evidence.samePayloadSha256, true);
  assert.equal(evidence.subsequentSubmissionVerified, true);
  assert.match(evidence.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test('FURS-OUT-001/002: recovery accepts automatic confirmation before an explicit retry', async () => {
  const zoi = 'zoi-value';
  const stateText = JSON.stringify({
    evidenceVersion: 1, environment: 'test', state: 'connectivity-interrupted', scenarioId: 'outage-v1',
    scenarioSha256: 'd'.repeat(64), sourceVersion, connectivityInterruptionObserved: true,
    deviceSoftwareOperationalVerified: true,
    original: {
      documentId: document, invoiceSequence: '12', issueLocalTime: '2026-08-13T12:55:00',
      messageId: message, payloadSha256: 'b'.repeat(64),
      zoiSha256: (await import('node:crypto')).createHash('sha256').update(zoi).digest('hex'),
      updatedAt: '2026-08-13T10:55:00.000Z'
    }
  });
  let requests = 0;
  const evidence = await recoverNetworkOutageEvidence({
    stateText, apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
    fetch: async (_url, options) => {
      requests += 1;
      assert.notEqual(options?.method, 'POST');
      if (requests === 1) return new Response(JSON.stringify({
        id: document, status: 'CONFIRMED', subsequentSubmit: true, invoiceSequence: '12',
        issueLocalTime: '2026-08-13T12:55:00', messageId: message, payloadSha256: 'b'.repeat(64),
        zoi, eor: '019ff57a-f30d-7290-9bb9-951bed760404', updatedAt: '2026-08-13T10:56:00.000Z'
      }));
      return new Response('starfiniti_furs_worker_heartbeat_age_seconds 1\nstarfiniti_furs_outbox_active 0\n');
    }, sleep: async () => undefined
  });
  assert.equal(requests, 2);
  assert.equal(evidence.finalStatus, 'CONFIRMED');
  assert.equal(evidence.sameDocumentId, true);
});

test('FURS-OUT-001/002: recovery resolves a retry 409 only after confirmation is proven', async () => {
  const zoi = 'zoi-value';
  const stateText = JSON.stringify({
    evidenceVersion: 1, environment: 'test', state: 'connectivity-interrupted', scenarioId: 'outage-v1',
    scenarioSha256: 'd'.repeat(64), sourceVersion, connectivityInterruptionObserved: true,
    deviceSoftwareOperationalVerified: true,
    original: {
      documentId: document, invoiceSequence: '12', issueLocalTime: '2026-08-13T12:55:00',
      messageId: message, payloadSha256: 'b'.repeat(64),
      zoiSha256: (await import('node:crypto')).createHash('sha256').update(zoi).digest('hex'),
      updatedAt: '2026-08-13T10:55:00.000Z'
    }
  });
  const responses = [
    new Response(JSON.stringify({ id: document, status: 'ISSUED_WITHOUT_EOR', messageId: message })),
    new Response(JSON.stringify({ error: { code: 'FURS_RETRY_STATE' } }), { status: 409 }),
    new Response(JSON.stringify({
      id: document, status: 'CONFIRMED', subsequentSubmit: true, invoiceSequence: '12',
      issueLocalTime: '2026-08-13T12:55:00', messageId: message, payloadSha256: 'b'.repeat(64),
      zoi, eor: '019ff57a-f30d-7290-9bb9-951bed760404', updatedAt: '2026-08-13T10:56:00.000Z'
    })),
    new Response('starfiniti_furs_worker_heartbeat_age_seconds 1\nstarfiniti_furs_outbox_active 0\n')
  ];
  const evidence = await recoverNetworkOutageEvidence({
    stateText, apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
    fetch: async () => responses.shift(), sleep: async () => undefined
  });
  assert.equal(responses.length, 0);
  assert.equal(evidence.finalStatus, 'CONFIRMED');
  assert.equal(evidence.sameZoiSha256, true);
});

test('FURS-OUT-001/002: recovery rejects a changed fiscal identity', async () => {
  const zoiSha256 = (await import('node:crypto')).createHash('sha256').update('zoi-value').digest('hex');
  const stateText = JSON.stringify({
    evidenceVersion: 1, environment: 'test', state: 'connectivity-interrupted', scenarioId: 'outage-v1',
    scenarioSha256: 'd'.repeat(64), sourceVersion, connectivityInterruptionObserved: true,
    deviceSoftwareOperationalVerified: true,
    original: {
      documentId: document, invoiceSequence: '12', issueLocalTime: '2026-08-13T12:55:00',
      messageId: message, payloadSha256: 'b'.repeat(64), zoiSha256, updatedAt: '2026-08-13T10:55:00.000Z'
    }
  });
  const responses = [
    new Response(JSON.stringify({ id: document, status: 'ISSUED_WITHOUT_EOR', messageId: message })),
    new Response('{}', { status: 202 }),
    new Response(JSON.stringify({
      id: document, status: 'CONFIRMED', subsequentSubmit: true, invoiceSequence: '13',
      issueLocalTime: '2026-08-13T12:55:00', messageId: message, payloadSha256: 'b'.repeat(64),
      zoi: 'zoi-value', eor: '019ff57a-f30d-7290-9bb9-951bed760404', updatedAt: '2026-08-13T10:56:00.000Z'
    }))
  ];
  await assert.rejects(
    recoverNetworkOutageEvidence({
      stateText, apiUrl: 'http://127.0.0.1:8080', token: 'x'.repeat(32),
      fetch: async () => responses.shift(), sleep: async () => undefined
    }),
    (error) => error.code === 'FURS_OUTAGE_IDENTITY'
  );
});
