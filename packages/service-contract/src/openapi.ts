import {
  businessPremiseRequestExample,
  electronicDeviceRequestExample,
  errorResponseExample,
  fiscalDocumentResponseExample,
  fiscalInvoiceRequestExample
} from './examples.js';
import {
  businessPremiseRequestSchema,
  echoResponseSchema,
  electronicDeviceRequestSchema,
  electronicDeviceResponseSchema,
  errorResponseSchema,
  fiscalDocumentSchema,
  fiscalInvoiceRequestSchema,
  liveHealthResponseSchema,
  operatorDocumentsResponseSchema,
  operatorSummaryResponseSchema,
  readyHealthResponseSchema,
  reconciliationResponseSchema,
  retryAcceptedResponseSchema,
  systemInfoResponseSchema
} from './schemas.js';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object, example?: unknown) => ({
  'application/json': { schema, ...(example === undefined ? {} : { example }) }
});
const response = (description: string, schema?: object, example?: unknown) => ({
  description,
  ...(schema === undefined ? {} : { content: json(schema, example) })
});

const errorResponses = {
  '400': response('Invalid request', ref('ErrorResponse'), errorResponseExample),
  '401': response('Authentication required', ref('ErrorResponse'), errorResponseExample),
  '403': response('Fiscalize permission required', ref('ErrorResponse'), errorResponseExample),
  '404': response('Not found', ref('ErrorResponse'), errorResponseExample),
  '409': response('Idempotency or state conflict', ref('ErrorResponse'), errorResponseExample),
  '429': response('Request rate limit exceeded', ref('ErrorResponse'), errorResponseExample),
  '500': response('Internal service failure', ref('ErrorResponse'), errorResponseExample)
} as const;

const idParameter = {
  name: 'id', in: 'path', required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' }
} as const;
const idempotencyParameter = {
  name: 'Idempotency-Key', in: 'header', required: true,
  schema: { type: 'string', minLength: 8, maxLength: 128 }
} as const;

export const openApiDocument = Object.freeze({
  openapi: '3.1.0',
  info: {
    title: 'Starfiniti FURS API',
    version: '0.1.0',
    description: 'Unofficial self-hosted Slovenian FURS fiscalization service.'
  },
  servers: [{ url: '/' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/v1/fiscal-invoices': {
      post: {
        operationId: 'createFiscalInvoice', parameters: [idempotencyParameter],
        requestBody: { required: true, content: json(ref('FiscalInvoiceRequest'), fiscalInvoiceRequestExample) },
        responses: {
          '202': response('Durably accepted', ref('FiscalDocument'), fiscalDocumentResponseExample),
          ...errorResponses
        }
      }
    },
    '/v1/fiscal-invoices/{id}': {
      get: {
        operationId: 'getFiscalInvoice', parameters: [idParameter],
        responses: {
          '200': response('Fiscal document', ref('FiscalDocument'), fiscalDocumentResponseExample),
          ...errorResponses
        }
      }
    },
    '/v1/fiscal-invoices/{id}/retry': {
      post: {
        operationId: 'retryFiscalInvoice', parameters: [idParameter],
        responses: { '202': response('Retry requested', ref('RetryAcceptedResponse')), ...errorResponses }
      }
    },
    '/v1/business-premises': {
      post: {
        operationId: 'upsertBusinessPremise', parameters: [idempotencyParameter],
        requestBody: { required: true, content: json(ref('BusinessPremiseRequest'), businessPremiseRequestExample) },
        responses: { '202': response('Premise durably accepted', ref('FiscalDocument')), ...errorResponses }
      }
    },
    '/v1/business-premises/{id}': {
      patch: {
        operationId: 'updateBusinessPremise',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 20 } },
          idempotencyParameter
        ],
        requestBody: { required: true, content: json(ref('BusinessPremiseRequest'), businessPremiseRequestExample) },
        responses: { '202': response('Premise update durably accepted', ref('FiscalDocument')), ...errorResponses }
      }
    },
    '/v1/electronic-devices/{id}': {
      put: {
        operationId: 'configureElectronicDevice',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 20 } }],
        requestBody: { required: true, content: json(ref('ElectronicDeviceRequest'), electronicDeviceRequestExample) },
        responses: { '200': response('Electronic device configured', ref('ElectronicDeviceResponse')), ...errorResponses }
      }
    },
    '/v1/reconciliation/run': {
      post: {
        operationId: 'runReconciliation',
        responses: { '202': response('Reconciliation requested', ref('ReconciliationResponse')), ...errorResponses }
      }
    },
    '/v1/operator/summary': {
      get: {
        operationId: 'getOperatorSummary',
        responses: { '200': response('Redacted operational summary', ref('OperatorSummaryResponse')), ...errorResponses }
      }
    },
    '/v1/operator/documents': {
      get: {
        operationId: 'listOperatorDocuments',
        parameters: [
          {
            name: 'status', in: 'query',
            schema: {
              type: 'string',
              enum: ['DRAFT', 'READY', 'SENDING', 'CONFIRMED', 'ISSUED_WITHOUT_EOR', 'RETRY_PENDING', 'REJECTED', 'MANUAL_REVIEW', 'REVERSED']
            }
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }
        ],
        responses: { '200': response('Redacted fiscal documents', ref('OperatorDocumentsResponse')), ...errorResponses }
      }
    },
    '/v1/furs/echo': {
      post: {
        operationId: 'fursEcho',
        requestBody: { required: true, content: json(ref('EchoResponse'), { value: 'connectivity-check' }) },
        responses: { '200': response('Echo response', ref('EchoResponse'), { value: 'connectivity-check' }), ...errorResponses }
      }
    },
    '/openapi.json': {
      get: { operationId: 'getOpenApiDocument', responses: { '200': response('OpenAPI 3.1 document'), ...errorResponses } }
    },
    '/metrics': {
      get: {
        operationId: 'getPrometheusMetrics',
        responses: {
          '200': {
            description: 'Redacted Prometheus metrics',
            content: { 'text/plain': { schema: { type: 'string' } } }
          },
          ...errorResponses
        }
      }
    },
    '/v1/system/info': {
      get: {
        operationId: 'getSystemInfo',
        responses: { '200': response('Configured environment and legal-entity identity', ref('SystemInfoResponse')), ...errorResponses }
      }
    },
    '/health/live': {
      get: {
        operationId: 'getLiveHealth', security: [],
        responses: { '200': response('Process is live', ref('LiveHealthResponse'), { status: 'ok' }) }
      }
    },
    '/health/ready': {
      get: {
        operationId: 'getReadyHealth', security: [],
        responses: {
          '200': response('Dependencies ready', ref('ReadyHealthResponse'), { status: 'ready' }),
          '503': response('A dependency is not ready', ref('ReadyHealthResponse'), { status: 'not-ready', failed: ['database'] })
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http', scheme: 'bearer',
        description: 'Use a read credential for GET/HEAD routes or a distinct fiscalize/write credential for all mutating routes.'
      }
    },
    schemas: {
      FiscalInvoiceRequest: { ...fiscalInvoiceRequestSchema, examples: [fiscalInvoiceRequestExample] },
      BusinessPremiseRequest: { ...businessPremiseRequestSchema, examples: [businessPremiseRequestExample] },
      ElectronicDeviceRequest: { ...electronicDeviceRequestSchema, examples: [electronicDeviceRequestExample] },
      FiscalDocument: { ...fiscalDocumentSchema, examples: [fiscalDocumentResponseExample] },
      ErrorResponse: { ...errorResponseSchema, examples: [errorResponseExample] },
      RetryAcceptedResponse: retryAcceptedResponseSchema,
      ReconciliationResponse: reconciliationResponseSchema,
      ElectronicDeviceResponse: electronicDeviceResponseSchema,
      EchoResponse: echoResponseSchema,
      SystemInfoResponse: systemInfoResponseSchema,
      OperatorSummaryResponse: operatorSummaryResponseSchema,
      OperatorDocumentsResponse: operatorDocumentsResponseSchema,
      LiveHealthResponse: liveHealthResponseSchema,
      ReadyHealthResponse: readyHealthResponseSchema
    }
  }
} as const);
