export const UUID_PATTERN = '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$';
export const SHA256_PATTERN = '^[a-f0-9]{64}$';

export const fiscalInvoiceRequestSchema = Object.freeze({
  $id: 'FiscalInvoiceRequest',
  type: 'object',
  additionalProperties: false,
  required: [
    'legalEntityId', 'taxNumber', 'kind', 'businessPremiseId', 'electronicDeviceId',
    'issueLocalTime', 'messageId', 'numberingStructure', 'invoiceAmount',
    'paymentAmount', 'taxesPerSeller', 'operator'
  ],
  properties: {
    legalEntityId: { type: 'string', pattern: UUID_PATTERN },
    taxNumber: { type: 'string', pattern: '^[1-9][0-9]{7}$' },
    kind: { type: 'string', enum: ['STANDARD', 'CORRECTION', 'CANCELLATION'] },
    correctionOfDocumentId: { type: 'string', pattern: UUID_PATTERN },
    businessPremiseId: { type: 'string', pattern: '^[0-9A-Za-z]{1,20}$' },
    electronicDeviceId: { type: 'string', pattern: '^[0-9A-Za-z]{1,20}$' },
    issueLocalTime: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$' },
    messageId: { type: 'string', pattern: UUID_PATTERN },
    numberingStructure: { type: 'string', enum: ['B', 'C'] },
    customerVatNumber: { type: 'string', minLength: 1, maxLength: 20 },
    invoiceAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
    returnsAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
    paymentAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
    taxesPerSeller: {
      type: 'array', minItems: 1, maxItems: 1000,
      items: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          sellerTaxNumber: { type: 'string', pattern: '^[1-9][0-9]{7}$' },
          vat: {
            type: 'array', minItems: 1, maxItems: 1000,
            items: {
              type: 'object', additionalProperties: false, required: ['rate', 'taxableAmount', 'taxAmount'],
              properties: {
                rate: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
                taxableAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
                taxAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' }
              }
            }
          },
          flatRateCompensation: {
            type: 'array', minItems: 1, maxItems: 1000,
            items: {
              type: 'object', additionalProperties: false, required: ['rate', 'taxableAmount', 'amount'],
              properties: {
                rate: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
                taxableAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
                amount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' }
              }
            }
          },
          otherTaxesAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
          exemptVatTaxableAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
          reverseVatTaxableAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
          nontaxableAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' },
          specialTaxRulesAmount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)\\.[0-9]{2}$' }
        },
        anyOf: [
          { required: ['vat'] }, { required: ['flatRateCompensation'] },
          { required: ['otherTaxesAmount'] }, { required: ['exemptVatTaxableAmount'] },
          { required: ['reverseVatTaxableAmount'] }, { required: ['nontaxableAmount'] },
          { required: ['specialTaxRulesAmount'] }
        ]
      }
    },
    operator: {
      type: 'object', additionalProperties: false, required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['slovenian', 'foreign', 'self-service'] },
        taxNumber: { type: 'string', pattern: '^[1-9][0-9]{7}$' }
      },
      allOf: [{
        if: { properties: { kind: { const: 'foreign' } }, required: ['kind'] },
        then: { not: { required: ['taxNumber'] } },
        else: { required: ['taxNumber'] }
      }]
    },
    subsequentSubmit: { type: 'boolean' },
    specialNotes: { type: 'string', maxLength: 1000 }
  },
  allOf: [
    {
      if: { properties: { kind: { const: 'STANDARD' } } },
      then: { not: { required: ['correctionOfDocumentId'] } },
      else: { required: ['correctionOfDocumentId'] }
    }
  ]
} as const);

export const businessPremiseRequestSchema = Object.freeze({
  $id: 'BusinessPremiseRequest',
  type: 'object',
  additionalProperties: false,
  required: ['legalEntityId', 'taxNumber', 'businessPremiseId', 'lifecycleStatus', 'messageId', 'sentAt', 'location', 'validityDate', 'softwareSuppliers'],
  properties: {
    legalEntityId: { type: 'string', pattern: UUID_PATTERN },
    taxNumber: { type: 'string', pattern: '^[1-9][0-9]{7}$' },
    businessPremiseId: { type: 'string', pattern: '^[0-9A-Za-z]{1,20}$' },
    lifecycleStatus: { type: 'string', enum: ['REGISTERED', 'CLOSED'] },
    messageId: { type: 'string', pattern: UUID_PATTERN },
    sentAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$' },
    location: {
      type: 'object', additionalProperties: false, required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['movable', 'real-estate'] },
        premiseType: { type: 'string', enum: ['A', 'B', 'C'] },
        cadastralNumber: { type: 'integer', minimum: 0, maximum: 9999 },
        buildingNumber: { type: 'integer', minimum: 0, maximum: 99999 },
        buildingSectionNumber: { type: 'integer', minimum: 0, maximum: 9999 },
        address: {
          type: 'object', additionalProperties: false,
          required: ['street', 'houseNumber', 'community', 'city', 'postalCode'],
          properties: {
            street: { type: 'string', minLength: 1, maxLength: 100 },
            houseNumber: { type: 'string', minLength: 1, maxLength: 10 },
            houseNumberAdditional: { type: 'string', minLength: 1, maxLength: 10 },
            community: { type: 'string', minLength: 1, maxLength: 100 },
            city: { type: 'string', minLength: 1, maxLength: 40 },
            postalCode: { type: 'string', pattern: '^[0-9]{4}$' }
          }
        }
      },
      allOf: [{
        if: { properties: { kind: { const: 'movable' } }, required: ['kind'] },
        then: { required: ['premiseType'] },
        else: { required: ['cadastralNumber', 'buildingNumber', 'buildingSectionNumber', 'address'] }
      }]
    },
    validityDate: { type: 'string', format: 'date' },
    softwareSuppliers: {
      type: 'array', minItems: 1, maxItems: 1000,
      items: {
        type: 'object', additionalProperties: false, required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['slovenian', 'foreign'] },
          taxNumber: { type: 'string', pattern: '^[1-9][0-9]{7}$' },
          nameAndAddress: { type: 'string', minLength: 1, maxLength: 1000 }
        },
        allOf: [{
          if: { properties: { kind: { const: 'slovenian' } }, required: ['kind'] },
          then: { required: ['taxNumber'] },
          else: { required: ['nameAndAddress'] }
        }]
      }
    },
    specialNotes: { type: 'string', minLength: 1, maxLength: 1000 }
  }
} as const);

export const errorResponseSchema = Object.freeze({
  $id: 'ErrorResponse',
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object', additionalProperties: false, required: ['code', 'message', 'correlationId'],
      properties: {
        code: { type: 'string', pattern: '^[A-Z0-9_:-]{1,100}$' },
        message: { type: 'string', maxLength: 500 },
        correlationId: { type: 'string', pattern: UUID_PATTERN }
      }
    }
  }
} as const);

export const electronicDeviceRequestSchema = Object.freeze({
  $id: 'ElectronicDeviceRequest', type: 'object', additionalProperties: false,
  required: ['legalEntityId', 'businessPremiseId', 'operational'],
  properties: {
    legalEntityId: { type: 'string', pattern: UUID_PATTERN },
    businessPremiseId: { type: 'string', pattern: '^[0-9A-Za-z]{1,20}$' },
    operational: { type: 'boolean' }
  }
} as const);

const fiscalDocumentShape = {
  type: 'object', additionalProperties: false,
  required: ['id', 'operationClass', 'kind', 'status', 'businessPremiseId', 'issueLocalTime', 'messageId', 'payloadSha256', 'schemaSha256', 'createdAt', 'updatedAt', 'subsequentSubmit'],
  properties: {
    id: { type: 'string', pattern: UUID_PATTERN },
    operationClass: { type: 'string', enum: ['FISCAL_INVOICE', 'BUSINESS_PREMISE'] },
    kind: { type: 'string', enum: ['STANDARD', 'CORRECTION', 'CANCELLATION', 'PREMISE'] },
    correctionOfDocumentId: { type: 'string', pattern: UUID_PATTERN },
    status: { type: 'string', enum: ['DRAFT','READY','SENDING','CONFIRMED','ISSUED_WITHOUT_EOR','RETRY_PENDING','REJECTED','MANUAL_REVIEW','REVERSED'] },
    businessPremiseId: { type: 'string' }, electronicDeviceId: { type: 'string' },
    invoiceSequence: { type: 'string', pattern: '^[1-9]\\d*$' }, issueLocalTime: { type: 'string' },
    messageId: { type: 'string', pattern: UUID_PATTERN }, payloadSha256: { type: 'string', pattern: SHA256_PATTERN },
    schemaSha256: { type: 'string', pattern: SHA256_PATTERN }, zoi: { type: 'string', pattern: '^[a-f0-9]{32}$' },
    eor: { type: 'string', pattern: UUID_PATTERN }, confirmedAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    subsequentSubmit: { type: 'boolean' }
  }
} as const;

export const fiscalDocumentSchema = Object.freeze({ $id: 'FiscalDocument', ...fiscalDocumentShape } as const);

export const retryAcceptedResponseSchema = Object.freeze({
  $id: 'RetryAcceptedResponse', type: 'object', additionalProperties: false,
  required: ['status'], properties: { status: { const: 'accepted' } }
} as const);

export const reconciliationResponseSchema = Object.freeze({
  $id: 'ReconciliationResponse', type: 'object', additionalProperties: false,
  required: ['queued'], properties: { queued: { type: 'integer', minimum: 0 } }
} as const);

export const electronicDeviceResponseSchema = Object.freeze({
  $id: 'ElectronicDeviceResponse', type: 'object', additionalProperties: false,
  required: ['id', 'operational'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN }, operational: { type: 'boolean' } }
} as const);

export const echoResponseSchema = Object.freeze({
  $id: 'EchoResponse', type: 'object', additionalProperties: false,
  required: ['value'], properties: { value: { type: 'string', minLength: 1, maxLength: 256 } }
} as const);

export const systemInfoResponseSchema = Object.freeze({
  $id: 'SystemInfoResponse', type: 'object', additionalProperties: false,
  required: ['environment', 'legalEntityId', 'apiMaximumRequestsPerMinute'],
  properties: {
    environment: { type: 'string', enum: ['test', 'production'] },
    legalEntityId: { type: 'string', pattern: UUID_PATTERN },
    apiMaximumRequestsPerMinute: { type: 'integer', minimum: 10, maximum: 100000 }
  }
} as const);

export const operatorSummaryResponseSchema = Object.freeze({
  $id: 'OperatorSummaryResponse', type: 'object', additionalProperties: false,
  required: ['documentsByStatus', 'activeOutboxJobs'],
  properties: {
    documentsByStatus: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
    activeOutboxJobs: { type: 'integer', minimum: 0 },
    oldestActiveOutboxAt: { type: 'string', format: 'date-time' },
    oldestUnconfirmedAt: { type: 'string', format: 'date-time' },
    workerLastSeenAt: { type: 'string', format: 'date-time' }
  }
} as const);

export const operatorDocumentsResponseSchema = Object.freeze({
  $id: 'OperatorDocumentsResponse', type: 'object', additionalProperties: false,
  required: ['documents'],
  properties: { documents: { type: 'array', maxItems: 500, items: fiscalDocumentShape } }
} as const);

export const liveHealthResponseSchema = Object.freeze({
  $id: 'LiveHealthResponse', type: 'object', additionalProperties: false,
  required: ['status'], properties: { status: { const: 'ok' } }
} as const);

export const readyHealthResponseSchema = Object.freeze({
  $id: 'ReadyHealthResponse', type: 'object', additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ready', 'not-ready'] },
    failed: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } }
  },
  allOf: [{
    if: { type: 'object', properties: { status: { const: 'not-ready' } }, required: ['status'] },
    then: { type: 'object', required: ['failed'] },
    else: { type: 'object', not: { type: 'object', required: ['failed'] } }
  }]
} as const);
