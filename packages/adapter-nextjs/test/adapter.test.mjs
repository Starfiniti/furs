import assert from 'node:assert/strict';
import test from 'node:test';
import { fiscalInvoiceFixture, InMemoryFiscalGateway, RecordingMetadataSink } from '@starfiniti/furs-testkit';
import { handleNextjsFiscalEvent } from '../dist/index.js';

test('FURS-IDEMP-001/PAY-001: custom event replay returns one fiscal document', async () => {
  const gateway = new InMemoryFiscalGateway();
  const metadata = new RecordingMetadataSink();
  const event = {
    applicationId: 'storefront', eventId: 'evt-1', aggregateId: 'invoice-1', revision: 'final-v1',
    signatureVerified: true, decision: { action: 'fiscalize', policyVersion: 'sl-2026-01', reviewedBy: 'tax-reviewer' },
    command: fiscalInvoiceFixture()
  };
  const first = await handleNextjsFiscalEvent(event, gateway, metadata);
  const replay = await handleNextjsFiscalEvent(event, gateway, metadata);
  assert.equal(first.kind, 'submitted');
  assert.equal(replay.kind, 'submitted');
  assert.equal(first.document.id, replay.document.id);
});
