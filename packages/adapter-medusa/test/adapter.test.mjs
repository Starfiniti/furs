import assert from 'node:assert/strict'; import test from 'node:test';
import { fiscalInvoiceFixture, InMemoryFiscalGateway, RecordingMetadataSink } from '@starfiniti/furs-testkit'; import { handleMedusaFiscalEvent } from '../dist/index.js';
test('Medusa duplicate events are replay safe', async () => {
  const gateway = new InMemoryFiscalGateway(); const metadata = new RecordingMetadataSink();
  const event = { storeId: 'store-1', orderId: 'order-1', name: 'payment.captured', eventId: 'event-1', aggregateId: 'ignored', revision: 'capture-v1', signatureVerified: true, decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'reviewer' }, command: fiscalInvoiceFixture() };
  const one = await handleMedusaFiscalEvent(event, gateway, metadata); const two = await handleMedusaFiscalEvent(event, gateway, metadata); assert.equal(one.document.id, two.document.id);
});
