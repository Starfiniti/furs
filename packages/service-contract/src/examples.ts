import type {
  BusinessPremiseRequest,
  ElectronicDeviceRequest,
  ErrorResponse,
  FiscalDocumentResponse,
  FiscalInvoiceRequest
} from './types.js';

export const fiscalInvoiceRequestExample = Object.freeze({
  legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760201',
  taxNumber: '12345678',
  kind: 'STANDARD',
  businessPremiseId: 'TRGOVINA1',
  electronicDeviceId: 'BLAG1',
  issueLocalTime: '2026-08-12T12:34:56',
  messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c',
  numberingStructure: 'B',
  invoiceAmount: '12.20',
  paymentAmount: '12.20',
  taxesPerSeller: [{ vat: [{ rate: '22.00', taxableAmount: '10.00', taxAmount: '2.20' }] }],
  operator: { kind: 'slovenian', taxNumber: '87654321' }
} as const satisfies FiscalInvoiceRequest);

export const businessPremiseRequestExample = Object.freeze({
  legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760201',
  taxNumber: '12345678',
  businessPremiseId: 'MOBILNA1',
  lifecycleStatus: 'REGISTERED',
  messageId: 'bf4dc2cf-c044-45f2-bc82-1746fc492b0d',
  sentAt: '2026-08-12T12:30:00',
  location: { kind: 'movable', premiseType: 'C' },
  validityDate: '2026-08-12',
  softwareSuppliers: [{ kind: 'slovenian', taxNumber: '12345678' }]
} as const satisfies BusinessPremiseRequest);

export const electronicDeviceRequestExample = Object.freeze({
  legalEntityId: '019ff57a-f30d-7290-9bb9-951bed760201',
  businessPremiseId: 'TRGOVINA1',
  operational: true
} as const satisfies ElectronicDeviceRequest);

export const fiscalDocumentResponseExample = Object.freeze({
  id: 'a10dd547-4497-4384-9ed8-3ce39b0ee5d6',
  operationClass: 'FISCAL_INVOICE',
  kind: 'STANDARD',
  status: 'CONFIRMED',
  businessPremiseId: 'TRGOVINA1',
  electronicDeviceId: 'BLAG1',
  invoiceSequence: '42',
  issueLocalTime: '2026-08-12T12:34:56',
  messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c',
  payloadSha256: 'a'.repeat(64),
  schemaSha256: 'b'.repeat(64),
  zoi: '1da0adb4cc87fd85f909e0acb99a2aa4',
  eor: 'b5f1c310-3dea-4331-82f8-d2dc72d9b018',
  confirmedAt: '2026-08-12T10:34:57.000Z',
  createdAt: '2026-08-12T10:34:56.000Z',
  updatedAt: '2026-08-12T10:34:57.000Z',
  subsequentSubmit: false
} as const satisfies FiscalDocumentResponse);

export const errorResponseExample = Object.freeze({
  error: {
    code: 'FURS_SCHEMA_VALIDATION',
    message: 'Request does not satisfy the fiscal service contract',
    correlationId: '8b1d74bc-d132-46a0-81fa-b0c07bb8e557'
  }
} as const satisfies ErrorResponse);
