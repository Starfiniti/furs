import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRestoreIntegrity } from './verify-restored-database.mjs';

const valid = {
  sequenceValue: '100', maximumAllocated: '99', orphanIdempotency: '0', duplicateFiscalIdentity: '0',
  confirmedInvoiceWithoutEor: '0', activeDocumentWithoutOutbox: '0', documentWithoutAudit: '0',
  payloadHashMismatch: 0, migrationDigestInvalid: '0'
};

test('FURS-ID-002/AUD-001: restored-database decision checks every authoritative invariant', () => {
  assert.deepEqual(evaluateRestoreIntegrity(valid), { ok: true, failures: [] });
  const failed = evaluateRestoreIntegrity({ ...valid, sequenceValue: '98', payloadHashMismatch: 1 });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.failures, ['SEQUENCE_BELOW_ALLOCATED_HIGH_WATER', 'PAYLOAD_HASH_MISMATCH']);
});
