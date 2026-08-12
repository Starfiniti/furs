import assert from 'node:assert/strict';
import test from 'node:test';

import { assertNoSensitiveLeak, fiscalInvoiceFixture, InMemoryFiscalGateway } from '../dist/index.js';

test('test gateway replays one document and rejects changed content', async () => {
  const gateway = new InMemoryFiscalGateway();
  const first = await gateway.createFiscalInvoice(fiscalInvoiceFixture(), 'adapter:key:1');
  const replay = await gateway.createFiscalInvoice(fiscalInvoiceFixture(), 'adapter:key:1');
  assert.equal(first.id, replay.id);
  await assert.rejects(gateway.createFiscalInvoice(fiscalInvoiceFixture({ invoiceAmount: '13.20' }), 'adapter:key:1'), /CONFLICT/);
});

test('FURS-SEC-001/002 leak assertion rejects keys, tokens and tax numbers', () => {
  assert.doesNotThrow(() => assertNoSensitiveLeak('document=abc status=READY'));
  assert.throws(() => assertNoSensitiveLeak('-----BEGIN PRIVATE KEY-----'));
  assert.throws(() => assertNoSensitiveLeak('12345678'));
  assert.throws(() => assertNoSensitiveLeak(`${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`));
});
