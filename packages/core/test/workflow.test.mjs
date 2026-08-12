import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  assertFiscalStatusTransition,
  assertIssuingDeviceOperational,
  BusinessPremiseId,
  classifyDeliveryFailure,
  createAttemptEvidence,
  ElectronicDeviceId,
  FiscalInvoiceIdentity,
  IdempotencyKey,
  InvoiceSequence,
  MessageId,
  PinnedOfficialSchemaValidator,
  PreparedFiscalCommand,
  ValidatedFursPayload,
  decideRetry,
  Zoi
} from '../dist/index.js';

const schemaBytes = Buffer.from(JSON.stringify({ type: 'object', required: ['InvoiceRequest'] }));
const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
  schemaBytes,
  createHash('sha256').update(schemaBytes).digest('hex')
);
const payload = ValidatedFursPayload.fromJson('{"InvoiceRequest":{}}', validator);
const identity = new FiscalInvoiceIdentity(
  BusinessPremiseId.parse('TRGOVINA1'),
  ElectronicDeviceId.parse('BLAG1'),
  InvoiceSequence.parse('1')
);

function command(overrides = {}) {
  return PreparedFiscalCommand.create({
    operationId: '019ff57a-f30d-7290-9bb9-951bed760001',
    legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760002',
    idempotencyKey: IdempotencyKey.parse('order:example:1'),
    kind: 'STANDARD',
    identity,
    messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c'),
    payload,
    zoi: Zoi.parse('1da0adb4cc87fd85f909e0acb99a2aa4'),
    issueDateTime: '2026-08-12T12:34:56',
    ...overrides
  });
}

test('FURS-AUD-001/OUT-001: workflow state transitions are explicit', () => {
  for (const [from, to] of [
    ['DRAFT', 'READY'],
    ['READY', 'SENDING'],
    ['SENDING', 'CONFIRMED'],
    ['SENDING', 'ISSUED_WITHOUT_EOR'],
    ['SENDING', 'RETRY_PENDING'],
    ['RETRY_PENDING', 'SENDING'],
    ['CONFIRMED', 'REVERSED']
  ]) {
    assert.doesNotThrow(() => assertFiscalStatusTransition(from, to));
  }
  for (const [from, to] of [
    ['DRAFT', 'CONFIRMED'],
    ['CONFIRMED', 'SENDING'],
    ['REJECTED', 'READY'],
    ['REVERSED', 'READY']
  ]) {
    assert.throws(() => assertFiscalStatusTransition(from, to), /not allowed/);
  }
});

test('FURS-IDEMP-001: immutable retry snapshot preserves identity, payload, message and ZOI', () => {
  const prepared = command();
  assert.equal(prepared.identity, identity);
  assert.equal(prepared.payloadJson, '{"InvoiceRequest":{}}');
  assert.equal(prepared.messageId.toString(), '4e64a93a-40fa-4c02-afb1-488534b85e4c');
  assert.equal(prepared.zoi.toString(), '1da0adb4cc87fd85f909e0acb99a2aa4');
  assert.equal(
    prepared.payloadSha256,
    createHash('sha256').update(prepared.payloadJson).digest('hex')
  );
  assert.equal(Object.isFrozen(prepared), true);
  assert.throws(() => IdempotencyKey.parse('short'));
});

test('FURS-COR-001: correction and cancellation require a different linked operation', () => {
  assert.throws(() => command({ kind: 'CORRECTION' }), /must reference/);
  assert.throws(() => command({ correctionOfOperationId: '019ff57a-f30d-7290-9bb9-951bed760003' }), /cannot reference/);
  const correction = command({
    operationId: '019ff57a-f30d-7290-9bb9-951bed760004',
    kind: 'CORRECTION',
    correctionOfOperationId: '019ff57a-f30d-7290-9bb9-951bed760001'
  });
  assert.equal(correction.kind, 'CORRECTION');
  assert.equal(correction.correctionOfOperationId, '019ff57a-f30d-7290-9bb9-951bed760001');
});

test('FURS-OUT-001/DEV-001: failures distinguish retry, rejection, anomaly and device fallback', () => {
  assert.equal(classifyDeliveryFailure('CONNECTION_TEMPORARY'), 'RETRY_PENDING');
  assert.equal(classifyDeliveryFailure('HTTP_SERVER_ERROR'), 'RETRY_PENDING');
  assert.equal(classifyDeliveryFailure('HTTP_CLIENT_ERROR'), 'MANUAL_REVIEW');
  assert.equal(classifyDeliveryFailure('FURS_BUSINESS_REJECTION'), 'REJECTED');
  assert.equal(classifyDeliveryFailure('INVALID_SIGNED_RESPONSE'), 'MANUAL_REVIEW');
  assert.equal(classifyDeliveryFailure('UNKNOWN_DELIVERY_OUTCOME'), 'MANUAL_REVIEW');
  assert.equal(classifyDeliveryFailure('ISSUING_DEVICE_FAILURE'), 'DEVICE_FALLBACK_REQUIRED');
  assert.throws(() => assertIssuingDeviceOperational(false), /VKR\/operator fallback/);
});

test('FURS-OUT-001: retry policy is bounded with capped exponential backoff', () => {
  assert.deepEqual(decideRetry({ attemptNumber: 1 }), {
    retry: true,
    delayMs: 1000,
    nextStatus: 'RETRY_PENDING'
  });
  assert.equal(decideRetry({ attemptNumber: 7 }).delayMs, 64_000);
  assert.deepEqual(decideRetry({ attemptNumber: 8 }), {
    retry: false,
    delayMs: undefined,
    nextStatus: 'MANUAL_REVIEW'
  });
  assert.equal(decideRetry({ attemptNumber: 20, maximumAttempts: 30 }).delayMs, 300_000);
});

test('FURS-AUD-001/SEC-002: attempt evidence stores hashes, not fiscal payload contents', () => {
  const evidence = createAttemptEvidence({
    requestPayloadJson: '{"sensitive":"request"}',
    responsePayloadJson: '{"sensitive":"response"}',
    certificateFingerprint256: Array(32).fill('AA').join(':'),
    schemaSha256: 'b'.repeat(64)
  });
  assert.equal(evidence.requestSha256.length, 64);
  assert.equal(evidence.responseSha256?.length, 64);
  assert.equal(JSON.stringify(evidence).includes('sensitive'), false);
});
