#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const IDENTIFIER = /^[0-9A-Za-z]{1,20}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/u;
const OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 = '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547';
const OFFICIAL_SCHEMA_SHA256 = '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd';

export class DeviceFailureEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function reject(code, message) { throw new DeviceFailureEvidenceError(code, message); }
function required(value, label) {
  if (typeof value !== 'string' || value.trim() === '') reject('FURS_DEVICE_CONFIG', `${label} is required`);
  return value;
}
function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function validateSourceVersion(sourceVersion) {
  if (
    sourceVersion?.technicalDocumentation !== '3.2' ||
    sourceVersion?.technicalDocumentationSha256 !== OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 ||
    sourceVersion?.schemaSha256 !== OFFICIAL_SCHEMA_SHA256
  ) reject('FURS_DEVICE_SOURCE', 'Device-failure evidence is not pinned to the reviewed official source versions');
  return sourceVersion;
}

function baseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { reject('FURS_DEVICE_URL', 'FURS_API_URL is invalid'); }
  const loopback = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!loopback || parsed.username || parsed.password || parsed.search || parsed.hash) {
    reject('FURS_DEVICE_URL', 'Device-failure evidence requires a credential-free loopback HTTP API URL');
  }
  return new URL(parsed.pathname.endsWith('/') ? parsed : `${parsed.toString()}/`);
}

export function parseDeviceFailureScenario(text) {
  let scenario;
  try { scenario = JSON.parse(text); } catch { reject('FURS_DEVICE_SCENARIO', 'Device-failure scenario is not valid JSON'); }
  if (typeof scenario !== 'object' || scenario === null || Array.isArray(scenario)) reject('FURS_DEVICE_SCENARIO', 'Device-failure scenario must be an object');
  if (scenario.environment !== 'test' || !UUID.test(scenario.legalEntityId ?? '')) reject('FURS_DEVICE_SCENARIO', 'Scenario must identify the test legal entity');
  if (!/^[A-Za-z0-9._:-]{1,100}$/u.test(scenario.scenarioId ?? '')) reject('FURS_DEVICE_SCENARIO', 'scenarioId is invalid');
  validateSourceVersion(scenario.sourceVersion);
  if (!IDENTIFIER.test(scenario.device?.businessPremiseId ?? '') || !IDENTIFIER.test(scenario.device?.electronicDeviceId ?? '')) {
    reject('FURS_DEVICE_SCENARIO', 'Scenario device identity is invalid');
  }
  const operation = scenario.operation;
  if (typeof operation !== 'object' || operation === null || !IDEMPOTENCY_KEY.test(operation.idempotencyKey ?? '')) reject('FURS_DEVICE_SCENARIO', 'Scenario operation is invalid');
  const request = operation.request;
  if (
    typeof request !== 'object' || request === null || request.kind !== 'STANDARD' || request.subsequentSubmit !== false ||
    request.legalEntityId !== scenario.legalEntityId || request.businessPremiseId !== scenario.device.businessPremiseId ||
    request.electronicDeviceId !== scenario.device.electronicDeviceId || !UUID.test(request.messageId ?? '')
  ) reject('FURS_DEVICE_SCENARIO', 'Operation must be an ordinary non-subsequent invoice for the failed device');
  return scenario;
}

async function request(fetchImpl, api, token, path, options = {}) {
  const response = await fetchImpl(new URL(path, api), {
    method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    headers: {
      authorization: `Bearer ${token}`, accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.idempotencyKey === undefined ? {} : { 'idempotency-key': options.idempotencyKey })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { reject('FURS_DEVICE_RESPONSE', 'Fiscal API returned invalid JSON'); }
  const expected = options.expectedStatuses ?? [200];
  if (!expected.includes(response.status)) reject('FURS_DEVICE_HTTP', `Fiscal API returned unexpected HTTP ${response.status}`);
  return { status: response.status, body };
}

function documentCount(summary) {
  if (typeof summary?.documentsByStatus !== 'object' || summary.documentsByStatus === null || !Number.isSafeInteger(summary.activeOutboxJobs)) {
    reject('FURS_DEVICE_SUMMARY', 'Operator summary is invalid');
  }
  let total = 0;
  for (const value of Object.values(summary.documentsByStatus)) {
    if (!Number.isSafeInteger(value) || value < 0) reject('FURS_DEVICE_SUMMARY', 'Operator document count is invalid');
    total += value;
  }
  return total;
}

async function configureDevice(fetchImpl, api, token, scenario, operational) {
  const configured = await request(fetchImpl, api, token, `v1/electronic-devices/${encodeURIComponent(scenario.device.electronicDeviceId)}`, {
    method: 'PUT', body: {
      legalEntityId: scenario.legalEntityId,
      businessPremiseId: scenario.device.businessPremiseId,
      operational
    }
  });
  if (configured.body.operational !== operational || !UUID.test(configured.body.id ?? '')) reject('FURS_DEVICE_STATE', 'Electronic-device state was not acknowledged');
}

export async function runDeviceFailureEvidence(options) {
  const scenario = parseDeviceFailureScenario(options.scenarioText);
  const api = baseUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const info = (await request(fetchImpl, api, options.token, 'v1/system/info')).body;
  if (info.environment !== 'test' || info.legalEntityId !== scenario.legalEntityId) reject('FURS_DEVICE_TARGET', 'Connected API does not match the device-failure test entity/environment');
  const before = (await request(fetchImpl, api, options.token, 'v1/operator/summary')).body;
  const documentsBefore = documentCount(before);
  if (before.activeOutboxJobs !== 0) reject('FURS_DEVICE_OUTBOX', 'Device-failure drill requires an isolated empty outbox');

  let deviceConfigured = false;
  let primaryError;
  try {
    await configureDevice(fetchImpl, api, options.token, scenario, true);
    deviceConfigured = true;
    await configureDevice(fetchImpl, api, options.token, scenario, false);
    const blocked = await request(fetchImpl, api, options.token, 'v1/fiscal-invoices', {
      method: 'POST', body: scenario.operation.request, idempotencyKey: scenario.operation.idempotencyKey,
      expectedStatuses: [400]
    });
    if (blocked.body?.error?.code !== 'FURS_DEVICE_FALLBACK_REQUIRED') {
      reject('FURS_DEVICE_BOUNDARY', 'Failed device did not return the explicit operator/VKR fallback boundary');
    }
    const listed = (await request(fetchImpl, api, options.token, 'v1/operator/documents?limit=500')).body;
    if (!Array.isArray(listed.documents)) reject('FURS_DEVICE_DOCUMENTS', 'Operator document listing is invalid');
    if (listed.documents.some((document) => document?.messageId === scenario.operation.request.messageId)) {
      reject('FURS_DEVICE_DOCUMENT_CREATED', 'Blocked issuing-device command created a fiscal document');
    }
    const after = (await request(fetchImpl, api, options.token, 'v1/operator/summary')).body;
    const documentsAfter = documentCount(after);
    if (after.activeOutboxJobs !== 0) reject('FURS_DEVICE_OUTBOX', 'Blocked issuing-device command created an outbox job');
    if (documentsAfter !== documentsBefore) reject('FURS_DEVICE_ISOLATION', 'Document count changed during the isolated device-failure drill');

    const summary = {
      evidenceVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: 'test',
      scenarioId: scenario.scenarioId,
      scenarioSha256: hash(options.scenarioText),
      sourceVersion: scenario.sourceVersion,
      deviceIdentitySha256: hash(`${scenario.device.businessPremiseId}/${scenario.device.electronicDeviceId}`),
      errorCode: 'FURS_DEVICE_FALLBACK_REQUIRED',
      ordinaryElectronicIssuanceBlocked: true,
      noFiscalDocumentCreated: true,
      noOutboxJobCreated: true,
      subsequentSubmissionNotUsed: true,
      technicalVkrBoundaryVerified: true,
      humanVkrProcedureExecuted: false,
      productionVkrApproval: false,
      deviceLeftNonOperational: true,
      failures: 0
    };
    return Object.freeze({ ...summary, evidenceSha256: hash(JSON.stringify(summary)) });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (deviceConfigured) {
      try {
        await configureDevice(fetchImpl, api, options.token, scenario, false);
      } catch (cleanupError) {
        if (primaryError === undefined) throw cleanupError;
      }
    }
  }
}

function assertExternal(workspace, path) {
  if (!isAbsolute(path)) reject('FURS_DEVICE_PATH', 'Evidence paths must be absolute');
  const relation = relative(resolve(workspace), resolve(path));
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) reject('FURS_DEVICE_PATH', 'Device-failure evidence must remain outside the repository');
}

async function main() {
  if (process.env.FURS_DEVICE_FAILURE_CONFIRMATION !== 'furs-test-device-failure-approved') reject('FURS_DEVICE_CONFIRMATION', 'Explicit device-failure drill confirmation is required');
  const workspace = process.cwd();
  const scenarioPath = required(process.env.FURS_DEVICE_FAILURE_SCENARIO_PATH, 'FURS_DEVICE_FAILURE_SCENARIO_PATH');
  const tokenPath = required(process.env.FURS_API_WRITE_TOKEN_FILE, 'FURS_API_WRITE_TOKEN_FILE');
  const outputPath = required(process.env.FURS_DEVICE_FAILURE_EVIDENCE_PATH, 'FURS_DEVICE_FAILURE_EVIDENCE_PATH');
  for (const path of [scenarioPath, tokenPath, outputPath]) assertExternal(workspace, path);
  const token = (await readFile(tokenPath, 'utf8')).replace(/\r?\n$/u, '');
  if (token.length < 32) reject('FURS_DEVICE_CONFIG', 'Write token file is invalid');
  const evidence = await runDeviceFailureEvidence({
    apiUrl: required(process.env.FURS_API_URL, 'FURS_API_URL'), token,
    scenarioText: await readFile(scenarioPath, 'utf8')
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ...evidence, outputPath }, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof DeviceFailureEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_DEVICE_FAILURE', message: 'Device-failure evidence failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
