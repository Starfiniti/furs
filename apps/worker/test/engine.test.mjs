import assert from 'node:assert/strict';
import test from 'node:test';

import { FursDomainError } from '@starfiniti/furs-core';
import { FiscalWorker } from '../dist/index.js';

const fingerprint = Array.from({ length: 32 }, () => 'AA').join(':');
const document = Object.freeze({
  id: '019ff57a-f30d-7290-9bb9-951bed760301',
  legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760302',
  operationClass: 'FISCAL_INVOICE',
  kind: 'STANDARD', idempotencyKey: 'order:worker:1', requestSha256: 'a'.repeat(64),
  status: 'READY', businessPremiseId: 'TRGOVINA1', electronicDeviceId: 'BLAG1',
  invoiceSequence: '42', issueLocalTime: '2026-08-12T12:34:56',
  messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c', schemaSha256: 'b'.repeat(64),
  payloadJson: '{"InvoiceRequest":{}}', payloadSha256: 'a'.repeat(64), zoi: 'c'.repeat(32),
  createdAt: '2026-08-12T10:34:56.000Z', updatedAt: '2026-08-12T10:34:56.000Z'
});
const job = Object.freeze({
  id: '7', documentId: document.id, jobType: 'SUBMIT', attemptCount: 1,
  lockedBy: 'worker-1', lockedAt: '2026-08-12T10:35:00.000Z'
});

function repository() {
  const calls = [];
  return {
    calls,
    claimOutboxJobs: async () => [job],
    getFiscalDocument: async () => document,
    startSending: async (...args) => { calls.push(['start', ...args]); },
    confirm: async (...args) => { calls.push(['confirm', ...args]); },
    reject: async (...args) => { calls.push(['reject', ...args]); },
    confirmBusinessPremise: async (...args) => { calls.push(['confirm-premise', ...args]); },
    rejectBusinessPremise: async (...args) => { calls.push(['reject-premise', ...args]); },
    scheduleRetry: async (...args) => { calls.push(['retry', ...args]); },
    markIssuedWithoutEor: async (...args) => { calls.push(['issued-without-eor', ...args]); },
    markManualReview: async (...args) => { calls.push(['manual', ...args]); },
    getPendingWebhookDelivery: async () => undefined,
    completeWebhook: async (...args) => { calls.push(['webhook-complete', ...args]); },
    retryWebhook: async (...args) => { calls.push(['webhook-retry', ...args]); },
    deadLetterWebhook: async (...args) => { calls.push(['webhook-dead', ...args]); },
    recoverStaleOutboxJobs: async () => 0,
    heartbeatWorker: async (...args) => { calls.push(['heartbeat', ...args]); }
  };
}

function worker(repo, submissionClient, options = {}) {
  return new FiscalWorker({
    repository: repo, submissionClient, workerId: 'worker-1', random: () => 0,
    clock: () => new Date('2026-08-12T10:35:01.000Z'), ...options
  });
}

test('FURS-AUD-001: verified confirmation persists hashes and the original identity', async () => {
  const repo = repository();
  const client = { submit: async (payload, messageId) => {
    assert.equal(payload, document.payloadJson);
    assert.equal(messageId, document.messageId);
    return { kind: 'confirmed', eor: '4e64a93a-40fa-4c02-afb1-488534b85e4d', responsePayloadJson: '{"token":"redacted"}', certificateFingerprint256: fingerprint };
  } };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.confirmed, 1);
  const confirmation = repo.calls.find(([name]) => name === 'confirm');
  assert.ok(confirmation);
  assert.equal(confirmation[1].requestSha256, document.payloadSha256);
  assert.match(confirmation[1].responseSha256, /^[a-f0-9]{64}$/);
  assert.equal(confirmation[2], '4e64a93a-40fa-4c02-afb1-488534b85e4d');
});

test('FURS-AUD-001/PREM-001: a database confirmation failure retains verified response evidence', async () => {
  const repo = repository();
  const premise = { ...document, operationClass: 'BUSINESS_PREMISE', kind: 'PREMISE', electronicDeviceId: undefined, invoiceSequence: undefined, zoi: undefined };
  repo.getFiscalDocument = async () => premise;
  repo.confirmBusinessPremise = async () => { throw Object.assign(new Error('database permission denied'), { code: '42501' }); };
  const client = { submit: async () => ({
    kind: 'confirmed', eor: undefined, responsePayloadJson: '{"verified":"response"}', certificateFingerprint256: fingerprint
  }) };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.manualReview, 1);
  const manual = repo.calls.find(([name]) => name === 'manual');
  assert.ok(manual);
  assert.match(manual[1].responseSha256, /^[a-f0-9]{64}$/);
  assert.equal(manual[1].certificateFingerprint256, fingerprint);
  assert.equal(manual[1].errorCode, '42501');
});

test('FURS-AUD-001: durable webhook jobs are signed-delivery boundaries with bounded retry', async () => {
  const repo = repository();
  const webhookJob = { ...job, jobType: 'WEBHOOK' };
  const delivery = {
    id: '9', documentId: document.id, destinationId: 'primary',
    payloadJson: '{"event":"fiscal-document.updated"}', payloadSha256: 'd'.repeat(64)
  };
  repo.claimOutboxJobs = async () => [webhookJob];
  repo.getPendingWebhookDelivery = async () => delivery;
  const webhookClient = { deliver: async () => { throw new FursDomainError('FURS_WEBHOOK_TIMEOUT', 'timeout'); } };
  const result = await worker(repo, { submit: async () => { throw new Error('must not submit to FURS'); } }, { webhookClient }).pollOnce();
  assert.equal(result.webhookRetried, 1);
  const retry = repo.calls.find(([name]) => name === 'webhook-retry');
  assert.ok(retry);
  assert.equal(retry[1], webhookJob);
  assert.equal(retry[2], delivery);
  assert.equal(retry[4], 'FURS_WEBHOOK_TIMEOUT');
});

test('FURS-OUT-001: temporary connection failure schedules bounded retry', async () => {
  const repo = repository();
  const client = { submit: async () => { throw new FursDomainError('FURS_TLS_TIMEOUT', 'timeout'); } };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.retried, 1);
  const retry = repo.calls.find(([name]) => name === 'retry');
  assert.ok(retry);
  assert.equal(retry[1].outcome, 'RETRYABLE_FAILURE');
  assert.equal(retry[2].toISOString(), '2026-08-12T10:35:02.000Z');
});

test('FURS-CLOCK-001/OUT-001: an unhealthy clock cannot reach FURS and schedules a bounded retry', async () => {
  const repo = repository();
  let submitted = false;
  const client = { submit: async () => { submitted = true; throw new Error('must not submit'); } };
  const result = await worker(repo, client, {
    assertSubmissionReady: () => { throw new FursDomainError('FURS_CLOCK_NOT_READY', 'clock is stale'); }
  }).pollOnce();
  assert.equal(result.retried, 1);
  assert.equal(submitted, false);
  assert.equal(repo.calls.some(([name]) => name === 'start'), true);
  const retry = repo.calls.find(([name]) => name === 'retry');
  assert.equal(retry[1].errorCode, 'FURS_CLOCK_NOT_READY');
});

test('FURS-OUT-001: retryable HTTP status retries but deterministic client status stops', async () => {
  const retryRepo = repository();
  const retryResult = await worker(retryRepo, {
    submit: async () => { throw new FursDomainError('FURS_TLS_HTTP_RETRYABLE', 'HTTP 503'); }
  }).pollOnce();
  assert.equal(retryResult.retried, 1);
  assert.equal(retryRepo.calls.some(([name]) => name === 'retry'), true);

  const clientRepo = repository();
  const clientResult = await worker(clientRepo, {
    submit: async () => { throw new FursDomainError('FURS_TLS_HTTP_CLIENT', 'HTTP 400'); }
  }).pollOnce();
  assert.equal(clientResult.manualReview, 1);
  assert.equal(clientRepo.calls.some(([name]) => name === 'retry'), false);
});

test('FURS-OUT-001: subsequent submission remains explicitly issued without EOR during outage', async () => {
  const repo = repository();
  repo.getFiscalDocument = async () => ({ ...document, status: 'ISSUED_WITHOUT_EOR', subsequentSubmit: true });
  const client = { submit: async () => { throw new FursDomainError('FURS_TLS_TIMEOUT', 'timeout'); } };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.retried, 1);
  assert.equal(repo.calls.some(([name]) => name === 'issued-without-eor'), true);
  assert.equal(repo.calls.some(([name]) => name === 'retry'), false);
});

test('FURS-JWS-002: invalid signed response is never retried as success', async () => {
  const repo = repository();
  const client = { submit: async () => { throw new FursDomainError('FURS_JWS_SIGNATURE', 'invalid'); } };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.manualReview, 1);
  const manual = repo.calls.find(([name]) => name === 'manual');
  assert.ok(manual);
  assert.equal(manual[1].outcome, 'SECURITY_FAILURE');
  assert.equal(repo.calls.some(([name]) => name === 'confirm'), false);
});

test('FURS-OUT-001: retry exhaustion moves the document to manual review', async () => {
  const repo = repository();
  const exhausted = { ...job, attemptCount: 8 };
  repo.claimOutboxJobs = async () => [exhausted];
  const client = { submit: async () => { throw new FursDomainError('FURS_TLS_TIMEOUT', 'timeout'); } };
  const result = await worker(repo, client, { maximumAttempts: 8 }).pollOnce();
  assert.equal(result.manualReview, 1);
  assert.equal(repo.calls.some(([name]) => name === 'retry'), false);
});

test('FURS-PREM-001: accepted premise response uses premise lifecycle confirmation without EOR', async () => {
  const repo = repository();
  const premise = { ...document, operationClass: 'BUSINESS_PREMISE', kind: 'PREMISE', electronicDeviceId: undefined, invoiceSequence: undefined, zoi: undefined };
  repo.getFiscalDocument = async () => premise;
  const client = { submit: async (_payload, _message, operationClass) => {
    assert.equal(operationClass, 'BUSINESS_PREMISE');
    return { kind: 'confirmed', eor: undefined, responsePayloadJson: '{"token":"redacted"}', certificateFingerprint256: fingerprint };
  } };
  const result = await worker(repo, client).pollOnce();
  assert.equal(result.confirmed, 1);
  assert.equal(repo.calls.some(([name]) => name === 'confirm-premise'), true);
  assert.equal(repo.calls.some(([name]) => name === 'confirm'), false);
});
