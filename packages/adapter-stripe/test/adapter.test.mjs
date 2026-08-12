import assert from 'node:assert/strict'; import { createHmac } from 'node:crypto'; import test from 'node:test';
import { fiscalInvoiceFixture, InMemoryFiscalGateway, RecordingMetadataSink } from '@starfiniti/furs-testkit'; import { handleStripeFiscalEvent, handleVerifiedStripeWebhook, verifyStripeWebhookSignature } from '../dist/index.js';
test('Stripe skips only from an explicit reviewed policy and rejects unverified webhooks', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const base = { accountId: 'acct-1', objectId: 'pi-1', type: 'payment_intent.succeeded', eventId: 'evt-1', aggregateId: 'ignored', revision: 'event-v1', signatureVerified: true };
  const skipped = await handleStripeFiscalEvent({ ...base, decision: { action: 'skip', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer', reasonCode: 'BANK_TRANSFER_REVIEWED' } }, gateway, metadata);
  assert.equal(skipped.kind, 'skipped'); assert.equal(gateway.calls, 0);
  await assert.rejects(handleStripeFiscalEvent({ ...base, signatureVerified: false, decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() }, gateway, metadata), /signature/);
});
test('Stripe timestamped raw-body signature enforces replay tolerance', () => {
  const rawBody = '{"id":"evt_test"}'; const secret = 'whsec_test'; const timestamp = 1786530902;
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const input = { rawBody, signatureHeader: `t=${timestamp},v1=${signature}`, endpointSecret: secret, now: new Date(timestamp * 1000) };
  assert.equal(verifyStripeWebhookSignature(input), true);
  assert.equal(verifyStripeWebhookSignature({ ...input, rawBody: `${rawBody} ` }), false);
  assert.equal(verifyStripeWebhookSignature({ ...input, now: new Date((timestamp + 301) * 1000) }), false);
  assert.equal(verifyStripeWebhookSignature({ ...input, toleranceSeconds: 0 }), false);
});
test('Stripe verified entry point authenticates before calling the fiscal gateway', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const rawBody = '{"id":"evt_safe"}'; const endpointSecret = 'whsec_boundary'; const timestamp = 1786530902;
  const signature = createHmac('sha256', endpointSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  const event = { accountId: 'acct-1', objectId: 'pi-safe', type: 'payment_intent.succeeded', eventId: 'evt-safe', aggregateId: 'ignored', revision: 'event-v1', decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const input = { rawBody, signatureHeader: `t=${timestamp},v1=${signature}`, endpointSecret, now: new Date(timestamp * 1000), event };
  const result = await handleVerifiedStripeWebhook(input, gateway, metadata);
  assert.equal(result.kind, 'submitted'); assert.equal(gateway.calls, 1);
  assert.throws(() => handleVerifiedStripeWebhook({ ...input, rawBody: `${rawBody} ` }, gateway, metadata), /verification failed/);
  assert.equal(gateway.calls, 1);
});
