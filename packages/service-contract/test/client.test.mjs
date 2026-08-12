import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';

import {
  FursApiClient,
  FursApiClientError,
  businessPremiseRequestExample,
  electronicDeviceRequestExample,
  errorResponseExample,
  fiscalDocumentResponseExample,
  fiscalInvoiceRequestExample,
  openApiDocument
} from '../dist/index.js';

const bearer = 'service-contract-test-bearer-token-32-plus';

test('FURS-IDEMP-001: TypeScript client sends the mandatory idempotency key', async () => {
  let captured;
  const client = new FursApiClient({
    baseUrl: 'https://furs.internal.example', bearerToken: bearer,
    fetch: async (url, init) => {
      captured = { url: url.toString(), init };
      return new Response(JSON.stringify({ id: 'one' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
  });
  await client.createFiscalInvoice({}, 'order:client:1');
  assert.equal(captured.url, 'https://furs.internal.example/v1/fiscal-invoices');
  assert.equal(captured.init.headers['idempotency-key'], 'order:client:1');
  assert.equal(captured.init.headers.authorization, `Bearer ${bearer}`);
});

test('service client preserves structured API failures', async () => {
  const client = new FursApiClient({
    baseUrl: 'https://furs.internal.example', bearerToken: bearer,
    fetch: async () => new Response(JSON.stringify({ error: { code: 'FURS_TEST', message: 'failed', correlationId: '4e64a93a-40fa-4c02-afb1-488534b85e4c' } }), { status: 409, headers: { 'content-type': 'application/json' } })
  });
  await assert.rejects(client.getFiscalInvoice('one'), (error) => {
    assert.ok(error instanceof FursApiClientError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'FURS_TEST');
    return true;
  });
});

test('OpenAPI 3.1 includes every supported endpoint and bearer security', () => {
  assert.equal(openApiDocument.openapi, '3.1.0');
  for (const path of ['/v1/furs/echo', '/v1/business-premises', '/v1/fiscal-invoices', '/v1/reconciliation/run', '/health/live', '/health/ready']) {
    assert.ok(path in openApiDocument.paths, path);
  }
  assert.equal(openApiDocument.components.securitySchemes.bearerAuth.scheme, 'bearer');
  const operations = Object.values(openApiDocument.paths)
    .flatMap((path) => Object.values(path))
    .map((operation) => operation.operationId)
    .filter(Boolean);
  for (const operation of [
    'createFiscalInvoice', 'getFiscalInvoice', 'retryFiscalInvoice',
    'upsertBusinessPremise', 'updateBusinessPremise', 'configureElectronicDevice',
    'runReconciliation', 'getOperatorSummary', 'listOperatorDocuments', 'fursEcho',
    'getSystemInfo', 'getLiveHealth', 'getReadyHealth'
  ]) {
    assert.ok(operations.includes(operation), `missing operation ${operation}`);
  }
});

test('FURS-SCHEMA-001: published OpenAPI examples validate against their component schemas', () => {
  const AjvConstructor = Ajv.default ?? Ajv;
  const validator = new AjvConstructor({
    strict: false,
    allErrors: true,
    formats: {
      date: /^\d{4}-\d{2}-\d{2}$/u,
      'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/u
    }
  });
  const expected = {
    FiscalInvoiceRequest: fiscalInvoiceRequestExample,
    BusinessPremiseRequest: businessPremiseRequestExample,
    ElectronicDeviceRequest: electronicDeviceRequestExample,
    FiscalDocument: fiscalDocumentResponseExample,
    ErrorResponse: errorResponseExample
  };
  for (const [name, example] of Object.entries(expected)) {
    const schema = openApiDocument.components.schemas[name];
    const validate = validator.compile(schema);
    assert.equal(validate(example), true, `${name}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(schema.examples, [example]);
  }
});

test('client covers mutable premise and operator endpoints with encoded parameters', async () => {
  const calls = [];
  const client = new FursApiClient({
    baseUrl: 'https://furs.internal.example', bearerToken: bearer,
    fetch: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  await client.updateBusinessPremise('PREMISE/ONE', {}, 'premise:key:one');
  await client.getOperatorSummary();
  await client.listOperatorDocuments('MANUAL_REVIEW', 25);
  await client.echo('hello');
  await client.getLiveHealth();
  assert.match(calls[0].url, /PREMISE%2FONE$/u);
  assert.equal(calls[0].init.headers['idempotency-key'], 'premise:key:one');
  assert.match(calls[2].url, /status=MANUAL_REVIEW&limit=25|limit=25&status=MANUAL_REVIEW/u);
  assert.equal(JSON.parse(calls[3].init.body).value, 'hello');
  assert.match(calls[4].url, /\/health\/live$/u);
});

test('FURS-SEC-002: client rejects insecure remote URLs and weak credentials', () => {
  assert.throws(() => new FursApiClient({ baseUrl: 'http://furs.example', bearerToken: bearer }), /HTTPS outside loopback/u);
  assert.throws(() => new FursApiClient({ baseUrl: 'https://furs.example', bearerToken: 'too-short' }), /at least 32/u);
  assert.doesNotThrow(() => new FursApiClient({ baseUrl: 'http://127.0.0.1:8080', bearerToken: bearer }));
});
