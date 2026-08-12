import assert from 'node:assert/strict'; import { createHmac } from 'node:crypto'; import test from 'node:test';
import { fiscalInvoiceFixture, InMemoryFiscalGateway, RecordingMetadataSink } from '@starfiniti/furs-testkit';
import { handleVerifiedWooCommerceWebhook, handleWooCommerceFiscalEvent, verifyWooCommerceWebhookHmac } from '../dist/index.js';
test('WooCommerce duplicate hooks are replay safe', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const event = { siteId: 'shop.si', orderId: '100', hook: 'woocommerce_payment_complete', eventId: 'hook-1', aggregateId: 'ignored', revision: 'paid-v1', signatureVerified: true, decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const one = await handleWooCommerceFiscalEvent(event, gateway, metadata); const two = await handleWooCommerceFiscalEvent(event, gateway, metadata);
  assert.equal(one.document.id, two.document.id); assert.equal(metadata.writes.length, 2);
});
test('WooCommerce encoded raw-body signature fails closed on mutation', () => {
  const raw = '{"id":100}'; const secret = 'woocommerce-test-secret';
  const signature = createHmac('sha256', secret).update(raw).digest('base64');
  assert.equal(verifyWooCommerceWebhookHmac(raw, signature, secret), true);
  assert.equal(verifyWooCommerceWebhookHmac(`${raw} `, signature, secret), false);
});
test('WooCommerce verified entry point authenticates before calling the fiscal gateway', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const rawBody = '{"id":100}'; const webhookSecret = 'woocommerce-boundary-secret';
  const event = { siteId: 'shop.si', orderId: '100', hook: 'woocommerce_payment_complete', eventId: 'hook-safe-1', aggregateId: 'ignored', revision: 'paid-v1', decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const signatureHeader = createHmac('sha256', webhookSecret).update(rawBody).digest('base64');
  const result = await handleVerifiedWooCommerceWebhook({ rawBody, signatureHeader, webhookSecret, event }, gateway, metadata);
  assert.equal(result.kind, 'submitted'); assert.equal(gateway.calls, 1);
  assert.throws(() => handleVerifiedWooCommerceWebhook({ rawBody: `${rawBody} `, signatureHeader, webhookSecret, event }, gateway, metadata), /verification failed/);
  assert.equal(gateway.calls, 1);
});
