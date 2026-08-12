import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  BusinessAddress,
  BusinessPremise,
  BusinessPremiseId,
  createValidatedBusinessPremiseRequest,
  FursDate,
  LocalInvoiceDateTime,
  MessageId,
  MovablePremiseLocation,
  PinnedOfficialSchemaValidator,
  PropertyIdentifier,
  RealEstatePremiseLocation,
  rejectUnsupportedVendingPremise,
  SlovenianTaxNumber,
  SoftwareSupplier
} from '../dist/index.js';

const premiseSchema = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['BusinessPremiseRequest'],
  properties: {
    BusinessPremiseRequest: {
      type: 'object',
      additionalProperties: false,
      required: ['Header', 'BusinessPremise'],
      properties: {
        Header: {
          type: 'object',
          required: ['MessageID', 'DateTime'],
          properties: {
            MessageID: { type: 'string' },
            DateTime: { type: 'string', format: 'date-time' }
          }
        },
        BusinessPremise: {
          type: 'object',
          required: ['TaxNumber', 'BusinessPremiseID', 'BPIdentifier', 'ValidityDate', 'SoftwareSupplier'],
          properties: {
            TaxNumber: { type: 'integer' },
            BusinessPremiseID: { type: 'string' },
            BPIdentifier: { type: 'object' },
            ValidityDate: { type: 'string', format: 'date-time' },
            ClosingTag: { enum: ['Z'] },
            SoftwareSupplier: { type: 'array', minItems: 1 },
            SpecialNotes: { type: 'string' }
          }
        }
      }
    }
  }
};
const schemaBytes = Buffer.from(JSON.stringify(premiseSchema));
const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
  schemaBytes,
  createHash('sha256').update(schemaBytes).digest('hex')
);
const sentAt = LocalInvoiceDateTime.parse('2026-08-12T12:34:56');
const taxNumber = SlovenianTaxNumber.parse('12345678');
const messageId = MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c');

function request(premise) {
  return JSON.parse(createValidatedBusinessPremiseRequest({ messageId, sentAt, businessPremise: premise }, validator).toString());
}

test('FURS-PREM-001: real-estate premise maps property, address and supplier exactly', () => {
  const premise = BusinessPremise.create({
    taxNumber,
    businessPremiseId: BusinessPremiseId.parse('TRGOVINA3'),
    location: new RealEstatePremiseLocation(
      new PropertyIdentifier(365, 12, 3),
      new BusinessAddress({
        street: 'Dunajska cesta',
        houseNumber: '24',
        houseNumberAdditional: 'B',
        community: 'Ljubljana',
        city: 'Ljubljana',
        postalCode: '1000'
      })
    ),
    validityDate: FursDate.parse('2026-08-12'),
    closing: false,
    softwareSuppliers: [SoftwareSupplier.slovenian(SlovenianTaxNumber.parse('24564444'))],
    specialNotes: 'Registration fixture'
  });
  const mapped = request(premise).BusinessPremiseRequest.BusinessPremise;

  assert.deepEqual(mapped.BPIdentifier.RealEstateBP.PropertyID, {
    CadastralNumber: 365,
    BuildingNumber: 12,
    BuildingSectionNumber: 3
  });
  assert.equal(mapped.BPIdentifier.RealEstateBP.Address.PostalCode, '1000');
  assert.deepEqual(mapped.SoftwareSupplier, [{ TaxNumber: 24564444 }]);
  assert.equal(mapped.ValidityDate, '2026-08-12');
  assert.equal(mapped.ClosingTag, undefined);
});

test('FURS-PREM-001: movable update/closure and foreign supplier are explicit', () => {
  for (const type of ['A', 'B', 'C']) {
    const premise = BusinessPremise.create({
      taxNumber,
      businessPremiseId: BusinessPremiseId.parse(`MOBILE${type}`),
      location: new MovablePremiseLocation(type),
      validityDate: FursDate.parse('2026-08-13'),
      closing: true,
      softwareSuppliers: [SoftwareSupplier.foreign('Starfiniti GmbH, Example Street 1, Austria')]
    });
    const mapped = request(premise).BusinessPremiseRequest.BusinessPremise;
    assert.deepEqual(mapped.BPIdentifier, { PremiseType: type });
    assert.equal(mapped.ClosingTag, 'Z');
    assert.deepEqual(mapped.SoftwareSupplier, [
      { NameForeign: 'Starfiniti GmbH, Example Street 1, Austria' }
    ]);
  }
});

test('FURS-VEND-001: vending types are a deliberate unsupported extension boundary', () => {
  for (const type of ['D', 'E', 'F']) {
    assert.throws(
      () => rejectUnsupportedVendingPremise(type),
      (error) => error.code === 'FURS_VENDING_UNSUPPORTED'
    );
  }
});

test('FURS-PREM-001: invalid premise data cannot reach serialization', () => {
  assert.throws(() => FursDate.parse('2026-02-29'));
  assert.throws(() => new PropertyIdentifier(10000, 1, 1));
  assert.throws(
    () =>
      new BusinessAddress({
        street: 'Street',
        houseNumber: '1',
        community: 'Town',
        city: 'Post office',
        postalCode: 'SI-1'
      })
  );
  assert.throws(() =>
    BusinessPremise.create({
      taxNumber,
      businessPremiseId: BusinessPremiseId.parse('EMPTY'),
      location: new MovablePremiseLocation('A'),
      validityDate: FursDate.parse('2026-08-12'),
      closing: false,
      softwareSuppliers: []
    })
  );
});
