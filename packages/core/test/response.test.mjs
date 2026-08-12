import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  FursDomainError,
  MessageId,
  PinnedOfficialSchemaValidator,
  verifyBusinessPremiseResponseJws,
  verifyInvoiceResponseJws
} from '../dist/index.js';
import { createResponseToken, fixture } from '../test-support/crypto-helpers.mjs';

const responseSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  additionalProperties: false,
  properties: {
    InvoiceResponse: { $ref: '#/definitions/InvoiceResponse' },
    BusinessPremiseResponse: { $ref: '#/definitions/BusinessPremiseResponse' }
  },
  definitions: {
    Header: {
      type: 'object',
      additionalProperties: false,
      required: ['MessageID', 'DateTime'],
      properties: {
        MessageID: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' },
        DateTime: { type: 'string', format: 'date-time' }
      }
    },
    Error: {
      type: 'object',
      additionalProperties: false,
      properties: { ErrorCode: { type: 'string' }, ErrorMessage: { type: 'string' } }
    },
    InvoiceResponse: {
      type: 'object',
      additionalProperties: false,
      required: ['Header'],
      properties: {
        Header: { $ref: '#/definitions/Header' },
        Error: { $ref: '#/definitions/Error' },
        UniqueInvoiceID: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' }
      }
    },
    BusinessPremiseResponse: {
      type: 'object',
      additionalProperties: false,
      required: ['Header'],
      properties: {
        Header: { $ref: '#/definitions/Header' },
        Error: { $ref: '#/definitions/Error' }
      }
    }
  }
};
const schemaBytes = Buffer.from(JSON.stringify(responseSchema));
const schema = PinnedOfficialSchemaValidator.fromUtf8Bytes(
  schemaBytes,
  createHash('sha256').update(schemaBytes).digest('hex')
);
const expectedMessageId = MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c');
const options = {
  jws: { trustAnchors: [fixture('test-ca-cert.pem')] },
  schema,
  expectedMessageId
};
const header = {
  MessageID: expectedMessageId.toString(),
  DateTime: '2015-08-07T13:06:52.631Z'
};

test('FURS-JWS-002/SCHEMA-001: confirmed invoice response becomes typed EOR evidence', () => {
  const result = verifyInvoiceResponseJws(
    createResponseToken({
      InvoiceResponse: {
        Header: header,
        UniqueInvoiceID: 'b5f1c310-3dea-4331-82f8-d2dc72d9d018'
      }
    }),
    options
  );

  assert.equal(result.kind, 'confirmed');
  assert.equal(result.eor.toString(), 'b5f1c310-3dea-4331-82f8-d2dc72d9d018');
  assert.equal(result.header.messageId.toString(), expectedMessageId.toString());
  assert.equal(result.header.dateTime, '2015-08-07T13:06:52.631Z');
  assert.match(result.signerFingerprint256, /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  assert.equal(result.schemaSha256, schema.sha256);
});

test('FURS-JWS-002/SCHEMA-001: rejected invoice response preserves structured FURS error', () => {
  const result = verifyInvoiceResponseJws(
    createResponseToken({
      InvoiceResponse: {
        Header: header,
        Error: { ErrorCode: 's001', ErrorMessage: 'Sporočilo ni v skladu s shemo.' }
      }
    }),
    options
  );

  assert.equal(result.kind, 'rejected');
  assert.deepEqual(result.error, { code: 'S001', message: 'Sporočilo ni v skladu s shemo.' });
});

test('FURS-PREM-001/JWS-002: premise accepted and rejected responses are typed', () => {
  const accepted = verifyBusinessPremiseResponseJws(
    createResponseToken({ BusinessPremiseResponse: { Header: header } }),
    options
  );
  const rejected = verifyBusinessPremiseResponseJws(
    createResponseToken({
      BusinessPremiseResponse: {
        Header: header,
        Error: { ErrorCode: 'S001', ErrorMessage: 'Invalid premise.' }
      }
    }),
    options
  );

  assert.equal(accepted.kind, 'accepted');
  assert.equal(rejected.kind, 'rejected');
  assert.equal(rejected.error.code, 'S001');
});

test('FURS-JWS-002: mismatched message IDs and ambiguous outcomes fail closed', () => {
  const wrongMessage = createResponseToken({
    InvoiceResponse: {
      Header: { ...header, MessageID: '593700da-5780-4380-be46-cf4a5cd89e8e' },
      UniqueInvoiceID: 'b5f1c310-3dea-4331-82f8-d2dc72d9d018'
    }
  });
  const ambiguous = createResponseToken({
    InvoiceResponse: {
      Header: header,
      UniqueInvoiceID: 'b5f1c310-3dea-4331-82f8-d2dc72d9d018',
      Error: { ErrorCode: 's001', ErrorMessage: 'Ambiguous.' }
    }
  });

  assert.throws(
    () => verifyInvoiceResponseJws(wrongMessage, options),
    (error) => error instanceof FursDomainError && error.code === 'FURS_RESPONSE_MESSAGE_ID'
  );
  assert.throws(
    () => verifyInvoiceResponseJws(ambiguous, options),
    (error) => error instanceof FursDomainError && error.code === 'FURS_INVOICE_RESPONSE_OUTCOME'
  );
});

test('FURS-SCHEMA-001: signed but malformed response payloads still fail validation/domain rules', () => {
  const extraField = createResponseToken({
    InvoiceResponse: {
      Header: header,
      UniqueInvoiceID: 'b5f1c310-3dea-4331-82f8-d2dc72d9d018',
      SecretUnexpectedField: 'must-not-pass'
    }
  });
  const incompleteError = createResponseToken({
    InvoiceResponse: { Header: header, Error: {} }
  });
  const noOutcome = createResponseToken({ InvoiceResponse: { Header: header } });

  assert.throws(() => verifyInvoiceResponseJws(extraField, options), /pinned official schema/);
  assert.throws(
    () => verifyInvoiceResponseJws(incompleteError, options),
    (error) => error instanceof FursDomainError && error.code === 'FURS_RESPONSE_ERROR_CODE'
  );
  assert.throws(
    () => verifyInvoiceResponseJws(noOutcome, options),
    (error) => error instanceof FursDomainError && error.code === 'FURS_INVOICE_RESPONSE_OUTCOME'
  );
});
