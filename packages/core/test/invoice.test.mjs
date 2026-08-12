import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  BusinessPremiseId,
  createValidatedInvoiceRequest,
  DecimalAmount,
  ElectronicDeviceId,
  FiscalInvoice,
  FiscalInvoiceIdentity,
  FlatRateCompensation,
  FursDate,
  InvoiceReference,
  InvoiceSequence,
  LocalInvoiceDateTime,
  MessageId,
  OperatorIdentity,
  PinnedOfficialSchemaValidator,
  SellerTaxes,
  SalesBookIdentifier,
  SalesBookReference,
  SlovenianTaxNumber,
  VatRate,
  VatSummary,
  Zoi
} from '../dist/index.js';

const invoiceRequestSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['InvoiceRequest'],
  properties: {
    InvoiceRequest: {
      type: 'object',
      additionalProperties: false,
      required: ['Header', 'Invoice'],
      properties: {
        Header: {
          type: 'object',
          additionalProperties: false,
          required: ['MessageID', 'DateTime'],
          properties: {
            MessageID: { type: 'string', pattern: '^[a-f0-9-]{36}$' },
            DateTime: { type: 'string', format: 'date-time' }
          }
        },
        Invoice: {
          type: 'object',
          required: [
            'TaxNumber',
            'IssueDateTime',
            'NumberingStructure',
            'InvoiceIdentifier',
            'InvoiceAmount',
            'PaymentAmount',
            'TaxesPerSeller',
            'ProtectedID'
          ],
          properties: {
            TaxNumber: { type: 'integer', minimum: 10000000, maximum: 99999999 },
            IssueDateTime: { type: 'string', format: 'date-time' },
            NumberingStructure: { enum: ['B', 'C'] },
            InvoiceIdentifier: { type: 'object' },
            CustomerVATNumber: { type: 'string' },
            InvoiceAmount: { type: 'number', multipleOf: 0.01 },
            ReturnsAmount: { type: 'number', multipleOf: 0.01 },
            PaymentAmount: { type: 'number', multipleOf: 0.01 },
            TaxesPerSeller: { type: 'array', minItems: 1 },
            OperatorTaxNumber: { type: 'integer' },
            ForeignOperator: { type: 'boolean' },
            ProtectedID: { type: 'string', pattern: '^[a-f0-9]{32}$' },
            SubsequentSubmit: { type: 'boolean' },
            ReferenceInvoice: { type: 'array', minItems: 1 },
            SpecialNotes: { type: 'string' }
          }
        }
      }
    }
  }
};
const schemaBytes = Buffer.from(JSON.stringify(invoiceRequestSchema));
const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
  schemaBytes,
  createHash('sha256').update(schemaBytes).digest('hex')
);

const liableTaxNumber = SlovenianTaxNumber.parse('12345678');
const identity = new FiscalInvoiceIdentity(
  BusinessPremiseId.parse('TRGOVINA1'),
  ElectronicDeviceId.parse('BLAG1'),
  InvoiceSequence.parse('12345')
);
const issueDateTime = LocalInvoiceDateTime.parse('2015-08-15T10:13:32');

function makeInvoice(operator = OperatorIdentity.slovenian(SlovenianTaxNumber.parse('87654321'))) {
  return FiscalInvoice.create({
    taxNumber: liableTaxNumber,
    issueDateTime,
    numberingStructure: 'B',
    identity,
    customerVatNumber: 'SI12345678',
    invoiceAmount: DecimalAmount.parse('1245.60'),
    returnsAmount: DecimalAmount.parse('0.10'),
    paymentAmount: DecimalAmount.parse('1245.50'),
    taxesPerSeller: [
      SellerTaxes.create({
        vat: [
          new VatSummary(
            VatRate.parse('22.00'),
            DecimalAmount.parse('1020.98'),
            DecimalAmount.parse('224.62')
          )
        ]
      }),
      SellerTaxes.create({
        sellerTaxNumber: SlovenianTaxNumber.parse('23456789'),
        flatRateCompensation: [
          new FlatRateCompensation(
            VatRate.parse('8.00'),
            DecimalAmount.parse('10.00'),
            DecimalAmount.parse('0.80')
          )
        ],
        otherTaxesAmount: DecimalAmount.parse('1.00'),
        exemptVatTaxableAmount: DecimalAmount.parse('2.00'),
        reverseVatTaxableAmount: DecimalAmount.parse('3.00'),
        nontaxableAmount: DecimalAmount.parse('4.00'),
        specialTaxRulesAmount: DecimalAmount.parse('5.00')
      })
    ],
    operator,
    protectedId: Zoi.parse('1da0adb4cc87fd85f909e0acb99a2aa4'),
    subsequentSubmit: false,
    referenceInvoices: [new InvoiceReference(identity, issueDateTime)],
    referenceSalesBooks: [
      new SalesBookReference(
        new SalesBookIdentifier('VKR-1', '01', '123456789012'),
        FursDate.parse('2015-08-14')
      )
    ],
    specialNotes: 'Golden invoice fixture'
  });
}

test('FURS-ID-001: fiscal identity components are immutable and canonical', () => {
  assert.equal(identity.toString(), 'TRGOVINA1/BLAG1/12345');
  assert.throws(() => InvoiceSequence.parse('012345'));
  assert.throws(() => InvoiceSequence.parse('12A'));
  assert.throws(() => BusinessPremiseId.parse('premise-with-dash'));
  assert.throws(() => ElectronicDeviceId.parse(''));
});

test('FURS-OP-001/002: local, foreign and self-service identities are explicit', () => {
  const local = JSON.parse(
    createValidatedInvoiceRequest(
      { messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c'), sentAt: issueDateTime, invoice: makeInvoice() },
      validator
    ).toString()
  ).InvoiceRequest.Invoice;
  assert.equal(local.OperatorTaxNumber, 87654321);
  assert.equal(local.ForeignOperator, false);

  const foreign = JSON.parse(
    createValidatedInvoiceRequest(
      {
        messageId: MessageId.parse('ef60b025-3f8e-43f8-8a7a-905095dc225f'),
        sentAt: issueDateTime,
        invoice: makeInvoice(OperatorIdentity.foreign())
      },
      validator
    ).toString()
  ).InvoiceRequest.Invoice;
  assert.equal(foreign.OperatorTaxNumber, undefined);
  assert.equal(foreign.ForeignOperator, true);

  const selfService = JSON.parse(
    createValidatedInvoiceRequest(
      {
        messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4d'),
        sentAt: issueDateTime,
        invoice: makeInvoice(OperatorIdentity.selfService(liableTaxNumber))
      },
      validator
    ).toString()
  ).InvoiceRequest.Invoice;
  assert.equal(selfService.OperatorTaxNumber, 12345678);
  assert.equal(selfService.ForeignOperator, false);

  assert.throws(() => makeInvoice(OperatorIdentity.selfService(SlovenianTaxNumber.parse('87654321'))));
});

test('FURS-MONEY-001/SCHEMA-001: validated payload preserves exact decimal JSON tokens', () => {
  const payload = createValidatedInvoiceRequest(
    { messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c'), sentAt: issueDateTime, invoice: makeInvoice() },
    validator
  );
  const json = payload.toString();

  assert.match(json, /"InvoiceAmount":1245\.60/);
  assert.match(json, /"ReturnsAmount":0\.10/);
  assert.match(json, /"TaxRate":22\.00/);
  assert.match(json, /"FlatRateRate":8\.00/);
  assert.doesNotMatch(json, /:-?\d+(?:\.\d+)?[eE][+-]?\d+/);
  assert.equal(payload.schemaSha256, validator.sha256);
  assert.equal(JSON.parse(json).InvoiceRequest.Invoice.InvoiceAmount, 1245.6);
  assert.deepEqual(JSON.parse(json).InvoiceRequest.Invoice.ReferenceSalesBook, [
    {
      ReferenceSalesBookIdentifier: {
        InvoiceNumber: 'VKR-1',
        SetNumber: '01',
        SerialNumber: '123456789012'
      },
      ReferenceSalesBookIssueDate: '2015-08-14'
    }
  ]);
});

test('FURS-MONEY-001/OP-001: invalid fiscal values fail before mapping', () => {
  assert.throws(() => VatRate.parse('22'));
  assert.throws(() => VatRate.parse('-0.00'));
  assert.throws(() => SellerTaxes.create({ sellerTaxNumber: liableTaxNumber }));
  assert.throws(() =>
    FiscalInvoice.create({
      taxNumber: liableTaxNumber,
      issueDateTime,
      numberingStructure: 'B',
      identity,
      invoiceAmount: DecimalAmount.parse('1.00'),
      paymentAmount: DecimalAmount.parse('1.00'),
      taxesPerSeller: [],
      operator: OperatorIdentity.foreign(),
      protectedId: Zoi.parse('1da0adb4cc87fd85f909e0acb99a2aa4')
    })
  );
});
