import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import { PinnedOfficialSchemaValidator } from '@starfiniti/furs-core';
import { PostgresFiscalRepository, runMigrations } from '@starfiniti/furs-persistence-postgres';
import {
  businessPremiseRequestExample,
  fiscalInvoiceRequestExample
} from '@starfiniti/furs-service-contract';

import { buildApi, CoreBusinessPremiseCommandFactory, CoreFiscalCommandFactory } from '../dist/index.js';

const bearer = 'test-only-bearer-token-with-32-characters-minimum';
const readBearer = 'test-only-read-token-with-32-characters-minimum';
const entityId = '019ff57a-f30d-7290-9bb9-951bed760201';
const premiseId = '019ff57a-f30d-7290-9bb9-951bed760202';
const deviceId = '019ff57a-f30d-7290-9bb9-951bed760203';

function adapter(db) {
  const query = (client, sql, params) => params === undefined && /;\s*\S/s.test(sql)
    ? client.exec(sql).then(() => ({ rows: [] }))
    : client.query(sql, params ?? []);
  return {
    query: (sql, params) => query(db, sql, params),
    transaction: (work) => db.transaction(async (tx) => work({ query: (sql, params) => query(tx, sql, params) }))
  };
}

function request(amount = '12.20') {
  return {
    legalEntityId: entityId,
    taxNumber: '12345678',
    kind: 'STANDARD',
    businessPremiseId: 'TRGOVINA1',
    electronicDeviceId: 'BLAG1',
    issueLocalTime: '2026-08-12T12:34:56',
    messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4c',
    numberingStructure: 'B',
    invoiceAmount: amount,
    paymentAmount: amount,
    taxesPerSeller: [{ vat: [{ rate: '22.00', taxableAmount: '10.00', taxAmount: '2.20' }] }],
    operator: { kind: 'slovenian', taxNumber: '87654321' }
  };
}

async function setup(t, apiOverrides = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  const database = adapter(db);
  await runMigrations(database);
  const repository = new PostgresFiscalRepository(database);
  await repository.createLegalEntity({ id: entityId, taxNumber: '12345678', legalName: 'Starfiniti test' });
  await repository.upsertBusinessPremise({
    id: premiseId, legalEntityId: entityId, businessPremiseId: 'TRGOVINA1',
    lifecycleStatus: 'REGISTERED', locationSnapshot: { PremiseType: 'C' }, validityDate: '2026-08-12'
  });
  await repository.upsertElectronicDevice({
    id: deviceId, legalEntityId: entityId, businessPremiseRecordId: premiseId, electronicDeviceId: 'BLAG1'
  });

  const schemaBytes = Buffer.from(JSON.stringify({
    type: 'object',
    anyOf: [{ required: ['InvoiceRequest'] }, { required: ['BusinessPremiseRequest'] }]
  }));
  const invoiceSchema = PinnedOfficialSchemaValidator.fromUtf8Bytes(
    schemaBytes, createHash('sha256').update(schemaBytes).digest('hex')
  );
  const signer = {
    getCertificateMetadata: () => { throw new Error('not used by ZOI'); },
    signRsaSha256: async (bytes) => createHash('sha256').update(bytes).digest()
  };
  const commandFactory = new CoreFiscalCommandFactory({ signer, invoiceSchema });
  const app = buildApi({
    repository, commandFactory,
    premiseCommandFactory: new CoreBusinessPremiseCommandFactory(invoiceSchema),
    writeBearerToken: bearer, readBearerToken: readBearer, legalEntityId: entityId, environment: 'test', echo: async (value) => value,
    ...apiOverrides
  });
  t.after(() => app.close());
  await app.ready();
  return { app, database, repository };
}

test('FURS-SEC-002: API requires auth and health endpoints disclose no secrets', async (t) => {
  const { app } = await setup(t);
  const unauthorized = await app.inject({ method: 'GET', url: '/openapi.json' });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/health/live' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/health/ready' })).statusCode, 200);
  assert.doesNotMatch(unauthorized.body, new RegExp(bearer));
});

test('FURS-SEC-002: read credential cannot fiscalize or perform operator writes', async (t) => {
  const { app } = await setup(t);
  const readable = await app.inject({
    method: 'GET', url: '/v1/operator/summary', headers: { authorization: `Bearer ${readBearer}` }
  });
  assert.equal(readable.statusCode, 200, readable.body);
  const forbidden = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${readBearer}`, 'idempotency-key': 'order:read:forbidden' }, payload: request()
  });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  assert.equal(forbidden.json().error.code, 'FURS_AUTH_SCOPE');
});

test('FURS-SEC-002: authenticated requests are rate limited', async (t) => {
  const { app } = await setup(t, { maximumRequestsPerMinute: 10 });
  for (let index = 0; index < 10; index += 1) {
    assert.equal((await app.inject({ method: 'GET', url: '/openapi.json', headers: { authorization: `Bearer ${readBearer}` } })).statusCode, 200);
  }
  const limited = await app.inject({ method: 'GET', url: '/openapi.json', headers: { authorization: `Bearer ${readBearer}` } });
  assert.equal(limited.statusCode, 429, limited.body);
  assert.equal(limited.json().error.code, 'FURS_RATE_LIMIT');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
});

test('FURS-IDEMP-001/ID-002: duplicate HTTP commands return one durable document and sequence', async (t) => {
  const { app, database } = await setup(t);
  const options = {
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:http:1001' },
    payload: request()
  };
  const first = await app.inject(options);
  const second = await app.inject(options);
  assert.equal(first.statusCode, 202, first.body);
  assert.equal(second.statusCode, 202, second.body);
  const one = first.json();
  const two = second.json();
  assert.equal(one.id, two.id);
  assert.equal(one.invoiceSequence, two.invoiceSequence);
  assert.equal('payloadJson' in one, false);
  assert.equal('certificateFingerprint256' in one, false);
  const counts = await database.query('select (select count(*) from furs.fiscal_documents)::int as documents, (select count(*) from furs.outbox_jobs)::int as jobs');
  assert.equal(counts.rows[0].documents, 1);
  assert.equal(counts.rows[0].jobs, 1);
});

test('FURS-IDEMP-001: reused key with changed command is rejected', async (t) => {
  const { app } = await setup(t);
  const headers = { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:http:conflict' };
  assert.equal((await app.inject({ method: 'POST', url: '/v1/fiscal-invoices', headers, payload: request() })).statusCode, 202);
  const conflict = await app.inject({ method: 'POST', url: '/v1/fiscal-invoices', headers, payload: request('13.20') });
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().error.code, 'FURS_IDEMPOTENCY_CONFLICT');
});

test('FURS-OUT-001: an already-issued subsequent submission is visibly tracked without EOR', async (t) => {
  const { app } = await setup(t);
  const result = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:subsequent:1001' },
    payload: { ...request(), subsequentSubmit: true }
  });
  assert.equal(result.statusCode, 202, result.body);
  assert.equal(result.json().status, 'ISSUED_WITHOUT_EOR');
});

test('FURS-PREM-001: premise registration is validated and durably queued', async (t) => {
  const { app, database } = await setup(t);
  const result = await app.inject({
    method: 'POST', url: '/v1/business-premises',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'premise:http:1001' },
    payload: {
      legalEntityId: entityId, taxNumber: '12345678', businessPremiseId: 'MOBILEA',
      lifecycleStatus: 'REGISTERED', messageId: '4e64a93a-40fa-4c02-afb1-488534b85e4f',
      sentAt: '2026-08-12T12:34:56', location: { kind: 'movable', premiseType: 'A' },
      validityDate: '2026-08-12', softwareSuppliers: [{ kind: 'slovenian', taxNumber: '12345678' }]
    }
  });
  assert.equal(result.statusCode, 202, result.body);
  assert.equal(result.json().status, 'READY');
  const stored = await database.query(`select operation_class from furs.fiscal_documents where id = $1`, [result.json().id]);
  assert.equal(stored.rows[0].operation_class, 'BUSINESS_PREMISE');
});

test('FURS-DEV-001: disabling an issuing device blocks new ordinary invoices', async (t) => {
  const { app } = await setup(t);
  const configured = await app.inject({
    method: 'PUT', url: '/v1/electronic-devices/BLAG1',
    headers: { authorization: `Bearer ${bearer}` },
    payload: { legalEntityId: entityId, businessPremiseId: 'TRGOVINA1', operational: false }
  });
  assert.equal(configured.statusCode, 200, configured.body);
  const blocked = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:device:blocked' },
    payload: request()
  });
  assert.equal(blocked.statusCode, 400, blocked.body);
  assert.equal(blocked.json().error.code, 'FURS_DEVICE_FALLBACK_REQUIRED');
});

test('FURS-COR-001: correction payload contains the confirmed original fiscal reference', async (t) => {
  const { app, database, repository } = await setup(t);
  const originalResponse = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:correction:original' },
    payload: request()
  });
  assert.equal(originalResponse.statusCode, 202, originalResponse.body);
  const original = originalResponse.json();
  const [job] = await repository.claimOutboxJobs('correction-test-worker');
  await repository.startSending(original.id, 'correction-test-worker');
  const fingerprint = Array(32).fill('AA').join(':');
  await repository.confirm({
    jobId: job.id, workerId: 'correction-test-worker', documentId: original.id,
    attemptNumber: 1, outcome: 'CONFIRMED', requestSha256: original.payloadSha256,
    responseSha256: 'd'.repeat(64), certificateFingerprint256: fingerprint,
    startedAt: new Date('2026-08-12T10:00:00Z'), finishedAt: new Date('2026-08-12T10:00:01Z')
  }, 'b5f1c310-3dea-4331-82f8-d2dc72d9d018', fingerprint);

  const correction = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:correction:credit-1' },
    payload: {
      ...request('-12.20'), kind: 'CORRECTION', correctionOfDocumentId: original.id,
      messageId: '4e64a93a-40fa-4c02-afb1-488534b85e50',
      taxesPerSeller: [{ vat: [{ rate: '22.00', taxableAmount: '-10.00', taxAmount: '-2.20' }] }]
    }
  });
  assert.equal(correction.statusCode, 202, correction.body);
  assert.notEqual(correction.json().invoiceSequence, original.invoiceSequence);
  const stored = await database.query('select payload_json from furs.fiscal_documents where id=$1', [correction.json().id]);
  const protocol = JSON.parse(stored.rows[0].payload_json).InvoiceRequest.Invoice;
  assert.deepEqual(protocol.ReferenceInvoice, [{
    ReferenceInvoiceIdentifier: {
      BusinessPremiseID: original.businessPremiseId,
      ElectronicDeviceID: original.electronicDeviceId,
      InvoiceNumber: original.invoiceSequence
    },
    ReferenceInvoiceIssueDateTime: original.issueLocalTime
  }]);
});

test('FURS-AMT-001: public contract preserves flat-rate compensation decimals', async (t) => {
  const { app, database } = await setup(t);
  const response = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'order:flat-rate:1' },
    payload: {
      ...request('108.00'), paymentAmount: '108.00',
      messageId: 'b2f76e52-e3e8-4e09-b5a0-eb18087e623a',
      taxesPerSeller: [{
        flatRateCompensation: [{ rate: '8.00', taxableAmount: '100.00', amount: '8.00' }]
      }]
    }
  });
  assert.equal(response.statusCode, 202, response.body);
  const stored = await database.query('select payload_json from furs.fiscal_documents where id=$1', [response.json().id]);
  const seller = JSON.parse(stored.rows[0].payload_json).InvoiceRequest.Invoice.TaxesPerSeller[0];
  assert.deepEqual(seller.FlatRateCompensation, [{
    FlatRateRate: 8, FlatRateTaxableAmount: 100, FlatRateAmount: 8
  }]);
});

test('FURS-SCHEMA-001: published request examples pass the live API contract', async (t) => {
  const { app } = await setup(t);
  const invoice = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'openapi:invoice:example' },
    payload: fiscalInvoiceRequestExample
  });
  assert.equal(invoice.statusCode, 202, invoice.body);

  const premise = await app.inject({
    method: 'POST', url: '/v1/business-premises',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'openapi:premise:example' },
    payload: businessPremiseRequestExample
  });
  assert.equal(premise.statusCode, 202, premise.body);

  const invalid = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'openapi:invoice:invalid' },
    payload: { ...fiscalInvoiceRequestExample, invoiceAmount: 12.2 }
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.equal(invalid.json().error.code, 'FURS_REQUEST_VALIDATION');
  assert.doesNotMatch(invalid.body, /12\.2/u);
});

test('FURS-SEC-002: unexpected API failures return generic HTTP 500 envelopes', async (t) => {
  const sensitive = 'do-not-disclose-internal-database-detail';
  const { app } = await setup(t, {
    commandFactory: { create: async () => { throw new Error(sensitive); } }
  });
  const response = await app.inject({
    method: 'POST', url: '/v1/fiscal-invoices',
    headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': 'internal:error:example' },
    payload: request()
  });
  assert.equal(response.statusCode, 500, response.body);
  assert.equal(response.json().error.code, 'FURS_INTERNAL_ERROR');
  assert.doesNotMatch(response.body, new RegExp(sensitive));
});
