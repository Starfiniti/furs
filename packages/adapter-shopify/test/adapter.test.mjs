import assert from 'node:assert/strict'; import { createHmac } from 'node:crypto'; import test from 'node:test';
import { fiscalInvoiceFixture, InMemoryFiscalGateway, RecordingMetadataSink } from '@starfiniti/furs-testkit'; import { handleShopifyFiscalEvent, handleVerifiedShopifyWebhook, verifyShopifyWebhookHmac } from '../dist/index.js';
test('Shopify duplicate webhook deliveries are replay safe', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const event = { shopDomain: 'shop.myshopify.com', resourceId: '100', topic: 'orders/paid', eventId: 'webhook-1', aggregateId: 'ignored', revision: 'paid-v1', signatureVerified: true, decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const one = await handleShopifyFiscalEvent(event, gateway, metadata); const two = await handleShopifyFiscalEvent(event, gateway, metadata); assert.equal(one.document.id, two.document.id);
});
test('Shopify raw-body HMAC verification fails closed on mutation', () => {
  const raw = Buffer.from('{"id":1}'); const secret = 'shopify-test-secret';
  const signature = createHmac('sha256', secret).update(raw).digest('base64');
  assert.equal(verifyShopifyWebhookHmac(raw, signature, secret), true);
  assert.equal(verifyShopifyWebhookHmac(Buffer.from('{"id":2}'), signature, secret), false);
  assert.equal(verifyShopifyWebhookHmac(raw, undefined, secret), false);
});
test('Shopify verified entry point authenticates before calling the fiscal gateway', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const rawBody = Buffer.from('{"id":100}'); const clientSecret = 'shopify-boundary-secret';
  const event = { shopDomain: 'shop.myshopify.com', resourceId: '100', topic: 'orders/paid', eventId: 'webhook-safe-1', aggregateId: 'ignored', revision: 'paid-v1', decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const hmacHeader = createHmac('sha256', clientSecret).update(rawBody).digest('base64');
  const result = await handleVerifiedShopifyWebhook({ rawBody, hmacHeader, clientSecret, event }, gateway, metadata);
  assert.equal(result.kind, 'submitted'); assert.equal(gateway.calls, 1);
  assert.throws(() => handleVerifiedShopifyWebhook({ rawBody: Buffer.from('{"id":101}'), hmacHeader, clientSecret, event }, gateway, metadata), /verification failed/);
  assert.equal(gateway.calls, 1);
});
