import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { processSignedFiscalResultWebhook, verifySignedFiscalResultWebhook } from '../dist/index.js';

const secret = ['fiscal', 'result', 'webhook', 'verification', 'fixture'].join('-');
const timestamp = '1786530902';
const payload = JSON.stringify({
  event: 'fiscal-document.updated',
  document: {
    id: '019ff57a-f30d-7290-9bb9-951bed760301', operationClass: 'FISCAL_INVOICE',
    kind: 'STANDARD', status: 'CONFIRMED', businessPremiseId: 'TRGOVINA1',
    electronicDeviceId: 'BLAG1', invoiceSequence: '42',
    messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c', payloadSha256: 'a'.repeat(64),
    zoi: 'b'.repeat(32), eor: '4e64a93a-40fa-4c02-afb1-488534b85e4d',
    confirmedAt: '2026-08-12T10:35:01.000Z', subsequentSubmit: false,
    updatedAt: '2026-08-12T10:35:01.000Z'
  }
});
const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
const valid = {
  rawBody: payload, webhookId: '11', timestampHeader: timestamp, signatureHeader: signature,
  secret, now: new Date(Number(timestamp) * 1000)
};

test('FURS-SEC-002/AUD-001: terminal result is authenticated before durable platform update', async () => {
  const applied = [];
  const result = await processSignedFiscalResultWebhook(valid, {
    applyTerminalResult: async (update) => { applied.push(update); }
  });
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.documentId, '019ff57a-f30d-7290-9bb9-951bed760301');
  assert.equal(applied.length, 1);
  assert.equal(applied[0].webhookId, '11');
});

test('FURS-SEC-002: result signature, raw body and replay window fail closed', () => {
  assert.throws(() => verifySignedFiscalResultWebhook({ ...valid, rawBody: `${payload} ` }), /verification failed/);
  assert.throws(() => verifySignedFiscalResultWebhook({ ...valid, signatureHeader: `v1=${'0'.repeat(64)}` }), /verification failed/);
  assert.throws(() => verifySignedFiscalResultWebhook({ ...valid, now: new Date((Number(timestamp) + 301) * 1000) }), /replay window/);
});

test('FURS-AUD-001: authenticated but non-terminal or incomplete result is rejected', () => {
  const changed = JSON.stringify({ event: 'fiscal-document.updated', document: { id: '019ff57a-f30d-7290-9bb9-951bed760301', status: 'READY' } });
  const changedSignature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${changed}`).digest('hex')}`;
  assert.throws(() => verifySignedFiscalResultWebhook({ ...valid, rawBody: changed, signatureHeader: changedSignature }), /not terminal/);
});
