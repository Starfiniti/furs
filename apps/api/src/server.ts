import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { FursDomainError, IdempotencyKey } from '@starfiniti/furs-core';
import type { FiscalDocumentStatus } from '@starfiniti/furs-core';
import type { PostgresFiscalRepository, StoredFiscalDocument } from '@starfiniti/furs-persistence-postgres';
import {
  businessPremiseRequestSchema,
  echoResponseSchema,
  electronicDeviceRequestSchema,
  electronicDeviceResponseSchema,
  errorResponseSchema,
  fiscalDocumentSchema,
  fiscalInvoiceRequestSchema,
  liveHealthResponseSchema,
  openApiDocument,
  operatorDocumentsResponseSchema,
  operatorSummaryResponseSchema,
  readyHealthResponseSchema,
  reconciliationResponseSchema,
  retryAcceptedResponseSchema,
  systemInfoResponseSchema,
  UUID_PATTERN,
  type BusinessPremiseRequest,
  type ElectronicDeviceRequest,
  type FiscalDocumentResponse,
  type FiscalInvoiceRequest
} from '@starfiniti/furs-service-contract';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import type { BusinessPremiseCommandFactory, FiscalCommandFactory } from './command-factory.js';
import { ApiMetrics, renderOperationalMetrics } from './metrics.js';

export interface ApiDependencies {
  readonly repository: PostgresFiscalRepository;
  readonly commandFactory: FiscalCommandFactory;
  readonly premiseCommandFactory: BusinessPremiseCommandFactory;
  readonly writeBearerToken: string;
  readonly readBearerToken?: string;
  readonly legalEntityId: string;
  readonly environment: 'test' | 'production';
  readonly maximumRequestsPerMinute?: number;
  readonly echo?: (value: string) => Promise<string>;
  readonly readinessChecks?: Readonly<Record<string, () => Promise<void>>>;
  readonly operationalStatus?: () => { readonly certificateDaysRemaining: number; readonly clockDriftMs: number | undefined };
  readonly metrics?: ApiMetrics;
}

function hash(value: string): Buffer { return createHash('sha256').update(value, 'utf8').digest(); }

function matches(expected: Buffer, actual: Buffer): boolean {
  return timingSafeEqual(expected, actual);
}

function isReadOperation(request: FastifyRequest): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}

function correlationId(request: FastifyRequest): string {
  const supplied = request.headers['x-correlation-id'];
  return typeof supplied === 'string' && /^[a-fA-F0-9-]{36}$/.test(supplied) ? supplied.toLowerCase() : randomUUID();
}

function response(document: StoredFiscalDocument): FiscalDocumentResponse {
  return {
    id: document.id, operationClass: document.operationClass, kind: document.kind,
    ...(document.correctionOfDocumentId === undefined ? {} : { correctionOfDocumentId: document.correctionOfDocumentId }),
    status: document.status, businessPremiseId: document.businessPremiseId,
    ...(document.electronicDeviceId === undefined ? {} : { electronicDeviceId: document.electronicDeviceId }),
    ...(document.invoiceSequence === undefined ? {} : { invoiceSequence: document.invoiceSequence }),
    issueLocalTime: document.issueLocalTime, messageId: document.messageId,
    payloadSha256: document.payloadSha256, schemaSha256: document.schemaSha256,
    ...(document.zoi === undefined ? {} : { zoi: document.zoi }),
    ...(document.eor === undefined ? {} : { eor: document.eor }),
    ...(document.confirmedAt === undefined ? {} : { confirmedAt: document.confirmedAt }),
    createdAt: document.createdAt, updatedAt: document.updatedAt,
    subsequentSubmit: document.subsequentSubmit
  };
}

function assertConfiguredEntity(actual: string, configured: string): void {
  if (actual !== configured) {
    throw new FursDomainError('FURS_LEGAL_ENTITY_MISMATCH', 'Fiscal command does not match the configured legal entity');
  }
}

const idempotencyHeadersSchema = {
  type: 'object', required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 128 } }
} as const;
const uuidPathSchema = {
  type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } }
} as const;
const codePathSchema = {
  type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', pattern: '^[0-9A-Za-z]{1,20}$' } }
} as const;
const operatorDocumentsQuerySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['DRAFT', 'READY', 'SENDING', 'CONFIRMED', 'ISSUED_WITHOUT_EOR', 'RETRY_PENDING', 'REJECTED', 'MANUAL_REVIEW', 'REVERSED']
    },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
  }
} as const;

export function buildApi(dependencies: ApiDependencies): FastifyInstance {
  if (dependencies.writeBearerToken.length < 32) throw new Error('FURS API write token must contain at least 32 characters');
  if (dependencies.readBearerToken !== undefined && dependencies.readBearerToken.length < 32) {
    throw new Error('FURS API read token must contain at least 32 characters');
  }
  if (dependencies.readBearerToken === dependencies.writeBearerToken) throw new Error('FURS API read and write tokens must be different');
  const app = Fastify({ logger: false, bodyLimit: 1_048_576, requestIdHeader: false });
  const expectedWriteTokenHash = hash(dependencies.writeBearerToken);
  const expectedReadTokenHash = dependencies.readBearerToken === undefined ? undefined : hash(dependencies.readBearerToken);
  const maximumRequestsPerMinute = dependencies.maximumRequestsPerMinute ?? 600;
  if (!Number.isSafeInteger(maximumRequestsPerMinute) || maximumRequestsPerMinute < 10 || maximumRequestsPerMinute > 100_000) {
    throw new Error('FURS API request limit must be between 10 and 100000 per minute');
  }
  const rateBuckets = new Map<string, { startedAt: number; count: number }>();
  const metrics = dependencies.metrics ?? new ApiMetrics();

  app.addHook('onRequest', async (request, reply) => {
    metrics.request();
    if (request.url === '/health/live' || request.url === '/health/ready' || request.url === '/console' || request.url.startsWith('/console/')) return;
    const authorization = request.headers.authorization;
    const candidate = typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7) : '';
    const actual = hash(candidate);
    const isWriteCredential = matches(expectedWriteTokenHash, actual);
    const isReadCredential = expectedReadTokenHash !== undefined && matches(expectedReadTokenHash, actual);
    if (!isWriteCredential && !isReadCredential) {
      return reply.code(401).send({ error: { code: 'FURS_AUTH_REQUIRED', message: 'Authentication required', correlationId: correlationId(request) } });
    }
    if (!isWriteCredential && !isReadOperation(request)) {
      return reply.code(403).send({ error: { code: 'FURS_AUTH_SCOPE', message: 'Fiscalize permission required', correlationId: correlationId(request) } });
    }

    const now = Date.now();
    const bucketKey = actual.toString('hex');
    const existing = rateBuckets.get(bucketKey);
    const bucket = existing === undefined || now - existing.startedAt >= 60_000
      ? { startedAt: now, count: 1 }
      : { startedAt: existing.startedAt, count: existing.count + 1 };
    rateBuckets.set(bucketKey, bucket);
    if (bucket.count > maximumRequestsPerMinute) {
      const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + 60_000 - now) / 1000));
      return reply.header('retry-after', String(retryAfter)).code(429).send({
        error: { code: 'FURS_RATE_LIMIT', message: 'Request rate limit exceeded', correlationId: correlationId(request) }
      });
    }
  });

  app.setErrorHandler(async (error, request, reply) => {
    metrics.error();
    const validationFailure = Array.isArray((error as { validation?: unknown }).validation);
    const domainFailure = error instanceof FursDomainError;
    const code = validationFailure ? 'FURS_REQUEST_VALIDATION' : domainFailure ? error.code : 'FURS_INTERNAL_ERROR';
    const status = validationFailure ? 400
      : code === 'FURS_IDEMPOTENCY_CONFLICT' || code === 'FURS_RETRY_STATE' ? 409
      : domainFailure ? 400 : 500;
    const message = validationFailure ? 'Request does not satisfy the fiscal service contract'
      : domainFailure ? error.message : 'Request could not be processed';
    await reply.code(status).send({ error: { code, message, correlationId: correlationId(request) } });
  });

  app.get('/health/live', { schema: { response: { 200: liveHealthResponseSchema } } }, async () => ({ status: 'ok' }));
  app.get('/health/ready', { schema: { response: { 200: readyHealthResponseSchema, 503: readyHealthResponseSchema } } }, async (_request, reply) => {
    const checks = { database: () => dependencies.repository.ping(), ...(dependencies.readinessChecks ?? {}) };
    const results = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
      try { await check(); return undefined; } catch { return name; }
    }));
    const failed = results.filter((name): name is string => name !== undefined);
    if (failed.length === 0) return { status: 'ready' };
    return reply.code(503).send({ status: 'not-ready', failed });
  });
  app.get('/openapi.json', async () => openApiDocument);
  app.get('/v1/system/info', { schema: { response: { 200: systemInfoResponseSchema } } }, async () => ({
    environment: dependencies.environment,
    legalEntityId: dependencies.legalEntityId
  }));
  app.get('/metrics', async (_request, reply) => {
    const summary = await dependencies.repository.getOperationalSummary(dependencies.legalEntityId);
    const health = dependencies.operationalStatus?.();
    return reply.type('text/plain; version=0.0.4').send(`${metrics.render()}${renderOperationalMetrics({
      ...summary,
      certificateDaysRemaining: health?.certificateDaysRemaining,
      clockDriftMs: health?.clockDriftMs
    })}`);
  });

  app.post<{ Body: FiscalInvoiceRequest }>('/v1/fiscal-invoices', {
    schema: {
      headers: idempotencyHeadersSchema,
      body: fiscalInvoiceRequestSchema,
      response: { 202: fiscalDocumentSchema, 400: errorResponseSchema, 401: errorResponseSchema, 409: errorResponseSchema, 500: errorResponseSchema }
    }
  }, async (request, reply) => {
    assertConfiguredEntity(request.body.legalEntityId, dependencies.legalEntityId);
    const rawKey = request.headers['idempotency-key'];
    const key = IdempotencyKey.parse(typeof rawKey === 'string' ? rawKey : '');
    await dependencies.repository.assertLegalEntityTaxNumber(request.body.legalEntityId, request.body.taxNumber);
    const reference = request.body.kind === 'STANDARD'
      ? undefined
      : await dependencies.repository.getConfirmedInvoiceReference(
          request.body.correctionOfDocumentId as string, request.body.legalEntityId
        );
    const sequence = await dependencies.repository.reserveInvoiceSequence(
      request.body.legalEntityId, request.body.businessPremiseId, request.body.electronicDeviceId, key.toString()
    );
    const command = await dependencies.commandFactory.create(request.body, key.toString(), sequence, reference);
    const document = await dependencies.repository.prepareFiscalCommand(command);
    metrics.accepted();
    return reply.code(202).send(response(document));
  });

  app.get<{ Params: { id: string } }>('/v1/fiscal-invoices/:id', {
    schema: { params: uuidPathSchema, response: { 200: fiscalDocumentSchema, 404: errorResponseSchema } }
  }, async (request, reply) => {
    const document = await dependencies.repository.getFiscalDocument(request.params.id, dependencies.legalEntityId);
    if (document === undefined) return reply.code(404).send({ error: { code: 'FURS_NOT_FOUND', message: 'Fiscal document not found', correlationId: correlationId(request) } });
    return response(document);
  });

  app.post<{ Params: { id: string } }>('/v1/fiscal-invoices/:id/retry', {
    schema: { params: uuidPathSchema, response: { 202: retryAcceptedResponseSchema } }
  }, async (request, reply) => {
    await dependencies.repository.requestRetry(request.params.id, correlationId(request), dependencies.legalEntityId);
    return reply.code(202).send({ status: 'accepted' });
  });

  app.post<{ Body: BusinessPremiseRequest }>('/v1/business-premises', {
    schema: { headers: idempotencyHeadersSchema, body: businessPremiseRequestSchema, response: { 202: fiscalDocumentSchema } }
  }, async (request, reply) => {
    assertConfiguredEntity(request.body.legalEntityId, dependencies.legalEntityId);
    const rawKey = request.headers['idempotency-key'];
    const key = IdempotencyKey.parse(typeof rawKey === 'string' ? rawKey : '');
    await dependencies.repository.assertLegalEntityTaxNumber(request.body.legalEntityId, request.body.taxNumber);
    const command = dependencies.premiseCommandFactory.create(request.body, key.toString());
    const document = await dependencies.repository.prepareBusinessPremiseCommand(
      command, request.body.location, request.body.validityDate
    );
    return reply.code(202).send(response(document));
  });

  app.patch<{ Params: { id: string }; Body: BusinessPremiseRequest }>('/v1/business-premises/:id', {
    schema: { params: codePathSchema, headers: idempotencyHeadersSchema, body: businessPremiseRequestSchema, response: { 202: fiscalDocumentSchema } }
  }, async (request, reply) => {
    assertConfiguredEntity(request.body.legalEntityId, dependencies.legalEntityId);
    if (request.params.id !== request.body.businessPremiseId) {
      throw new FursDomainError('FURS_PREMISE_PATH_CONFLICT', 'Path and body business-premise IDs must match');
    }
    const rawKey = request.headers['idempotency-key'];
    const key = IdempotencyKey.parse(typeof rawKey === 'string' ? rawKey : '');
    await dependencies.repository.assertLegalEntityTaxNumber(request.body.legalEntityId, request.body.taxNumber);
    const command = dependencies.premiseCommandFactory.create(request.body, key.toString());
    const document = await dependencies.repository.prepareBusinessPremiseCommand(
      command, request.body.location, request.body.validityDate
    );
    return reply.code(202).send(response(document));
  });

  app.post('/v1/reconciliation/run', {
    schema: { response: { 202: reconciliationResponseSchema } }
  }, async (request, reply) => {
    const queued = await dependencies.repository.enqueueReconciliation(correlationId(request), dependencies.legalEntityId);
    return reply.code(202).send({ queued });
  });

  app.put<{ Params: { id: string }; Body: ElectronicDeviceRequest }>('/v1/electronic-devices/:id', {
    schema: { params: codePathSchema, body: electronicDeviceRequestSchema, response: { 200: electronicDeviceResponseSchema } }
  }, async (request) => {
    assertConfiguredEntity(request.body.legalEntityId, dependencies.legalEntityId);
    const id = await dependencies.repository.configureElectronicDevice({
      legalEntityId: request.body.legalEntityId,
      businessPremiseId: request.body.businessPremiseId,
      electronicDeviceId: request.params.id,
      operational: request.body.operational,
      correlationId: correlationId(request)
    });
    return { id, operational: request.body.operational };
  });

  app.get('/v1/operator/summary', {
    schema: { response: { 200: operatorSummaryResponseSchema } }
  }, async () => dependencies.repository.getOperationalSummary(dependencies.legalEntityId));

  app.get<{ Querystring: { status?: string; limit?: string | number } }>('/v1/operator/documents', {
    schema: { querystring: operatorDocumentsQuerySchema, response: { 200: operatorDocumentsResponseSchema } }
  }, async (request) => {
    const status = request.query.status as FiscalDocumentStatus | undefined;
    const limit = request.query.limit === undefined ? 100 : Number(request.query.limit);
    const documents = await dependencies.repository.listFiscalDocuments(status, limit, dependencies.legalEntityId);
    return { documents: documents.map(response) };
  });

  app.post<{ Body: { value: string } }>('/v1/furs/echo', {
    schema: { body: echoResponseSchema, response: { 200: echoResponseSchema } }
  }, async (request) => {
    if (dependencies.echo === undefined) throw new FursDomainError('FURS_ECHO_UNAVAILABLE', 'FURS echo is not configured');
    return { value: await dependencies.echo(request.body.value) };
  });

  return app;
}
