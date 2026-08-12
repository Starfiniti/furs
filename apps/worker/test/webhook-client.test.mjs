import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import { SignedWebhookClient } from '../dist/index.js';

const payloadJson = '{"event":"fiscal-document.updated","document":{"id":"one"}}';
const delivery = {
  id: '11', documentId: '019ff57a-f30d-7290-9bb9-951bed760301', destinationId: 'primary',
  payloadJson, payloadSha256: createHash('sha256').update(payloadJson).digest('hex')
};

test('FURS-SEC-002: webhook body is hash-checked and HMAC signed', async () => {
  const secret = 'webhook-test-secret-with-at-least-32-characters';
  let observed;
  const client = new SignedWebhookClient({
    destinationId: 'primary', url: 'https://adapter.example.test/furs', secret,
    fetch: async (url, init) => { observed = { url, init }; return new Response(null, { status: 204 }); }
  });
  const deliveredAt = new Date('2026-08-12T10:35:02.000Z');
  await client.deliver(delivery, deliveredAt);
  assert.equal(observed.url, 'https://adapter.example.test/furs');
  assert.equal(observed.init.body, payloadJson);
  const timestamp = '1786530902';
  assert.equal(observed.init.headers['x-starfiniti-webhook-timestamp'], timestamp);
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payloadJson}`).digest('hex');
  assert.equal(observed.init.headers['x-starfiniti-webhook-signature'], `v1=${expected}`);
});

test('FURS-SEC-002: a changed stored webhook payload fails closed before network delivery', async () => {
  let called = false;
  const client = new SignedWebhookClient({
    destinationId: 'primary', url: 'https://adapter.example.test/furs',
    secret: 'webhook-test-secret-with-at-least-32-characters',
    fetch: async () => { called = true; return new Response(null, { status: 204 }); }
  });
  await assert.rejects(client.deliver({ ...delivery, payloadJson: '{}' }, new Date()), (error) => error.code === 'FURS_WEBHOOK_PAYLOAD_HASH');
  assert.equal(called, false);
});
