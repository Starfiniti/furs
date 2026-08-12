import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  FursDomainError,
  FursSchemaValidationError,
  PinnedOfficialSchemaValidator
} from '../dist/index.js';

const schemaBytes = Buffer.from(JSON.stringify({
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['IssueDateTime', 'InvoiceAmount'],
  properties: {
    IssueDateTime: { type: 'string', format: 'date-time' },
    InvoiceAmount: {
      type: 'number',
      multipleOf: 0.01,
      minimum: -100000000000000,
      exclusiveMinimum: true,
      maximum: 100000000000000,
      exclusiveMaximum: true
    }
  }
}));
const digest = createHash('sha256').update(schemaBytes).digest('hex');

test('FURS-SCHEMA-001: pinned Draft-04 schema validates supported values', () => {
  const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(schemaBytes, digest);
  const value = validator.parseAndAssertValid(
    '{"IssueDateTime":"2026-08-12T12:34:56Z","InvoiceAmount":1245.56}'
  );

  assert.deepEqual(value, {
    IssueDateTime: '2026-08-12T12:34:56Z',
    InvoiceAmount: 1245.56
  });
  assert.equal(validator.sha256, digest);
});

test('FURS-SCHEMA-001/TIME-002: documented FURS local and UTC date-times are accepted', () => {
  const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(schemaBytes, digest);

  assert.doesNotThrow(() =>
    validator.assertValid({ IssueDateTime: '2026-08-12T12:34:56', InvoiceAmount: 1.1 })
  );
  assert.doesNotThrow(() =>
    validator.assertValid({ IssueDateTime: '2026-08-12T10:34:56Z', InvoiceAmount: 1.1 })
  );
  assert.doesNotThrow(() =>
    validator.assertValid({ IssueDateTime: '2026-08-12T12:34:56+02:00', InvoiceAmount: 1.1 })
  );
  assert.doesNotThrow(() =>
    validator.assertValid({ IssueDateTime: '2026-08-12', InvoiceAmount: 1.1 })
  );
  assert.doesNotThrow(() =>
    validator.assertValid({ IssueDateTime: '2026-08-12T10:34:56.631Z', InvoiceAmount: 1.1 })
  );

  for (const invalid of [
    '2026-02-29T12:34:56',
    '2026-08-12T24:00:00',
    '2026-08-12T12:34:56+14:01'
  ]) {
    assert.throws(() => validator.assertValid({ IssueDateTime: invalid, InvoiceAmount: 1.1 }));
  }
});

test('FURS-SCHEMA-001: a changed schema digest fails before compilation', () => {
  assert.throws(
    () => PinnedOfficialSchemaValidator.fromUtf8Bytes(schemaBytes, '0'.repeat(64)),
    (error) => error instanceof FursDomainError && error.code === 'FURS_SCHEMA_DIGEST_MISMATCH'
  );
});

test('FURS-SCHEMA-001: repeated FURS annotation ids do not create ambiguous references', () => {
  const bytes = Buffer.from(JSON.stringify({
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object',
    properties: {
      First: { id: 'RepeatedLabel', type: 'string' },
      Second: { id: 'RepeatedLabel', type: 'string' }
    }
  }));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(bytes, sha256);
  assert.doesNotThrow(() => validator.assertValid({ First: 'a', Second: 'b' }));
});

test('FURS-SCHEMA-001/SEC-002: validation errors contain no rejected payload values', () => {
  const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(schemaBytes, digest);
  const sensitiveValue = 'customer-secret@example.invalid';

  assert.throws(
    () => validator.assertValid({
      IssueDateTime: sensitiveValue,
      InvoiceAmount: '1245.56'
    }),
    (error) => {
      assert.equal(error instanceof FursSchemaValidationError, true);
      assert.equal(JSON.stringify(error).includes(sensitiveValue), false);
      assert.equal(error.message.includes(sensitiveValue), false);
      return true;
    }
  );
});
