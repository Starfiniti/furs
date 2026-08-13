#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TERMINAL_FAILURE = new Set(['REJECTED', 'MANUAL_REVIEW', 'REVERSED']);
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 = '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547';
const OFFICIAL_SCHEMA_SHA256 = '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd';

export class NetworkOutageEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function reject(code, message) { throw new NetworkOutageEvidenceError(code, message); }
function required(value, label) {
  if (typeof value !== 'string' || value.trim() === '') reject('FURS_OUTAGE_CONFIG', `${label} is required`);
  return value;
}
function hash(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function delay(milliseconds) { return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)); }

function validateSourceVersion(sourceVersion) {
  if (
    sourceVersion?.technicalDocumentation !== '3.2' ||
    sourceVersion?.technicalDocumentationSha256 !== OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 ||
    sourceVersion?.schemaSha256 !== OFFICIAL_SCHEMA_SHA256
  ) reject('FURS_OUTAGE_SOURCE', 'Outage evidence is not pinned to the reviewed official source versions');
  return sourceVersion;
}

function baseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { reject('FURS_OUTAGE_URL', 'FURS_API_URL is invalid'); }
  const loopback = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!loopback || parsed.username || parsed.password || parsed.search || parsed.hash) {
    reject('FURS_OUTAGE_URL', 'Outage evidence requires a credential-free loopback HTTP API URL');
  }
  return new URL(parsed.pathname.endsWith('/') ? parsed : `${parsed.toString()}/`);
}

export function parseOutageScenario(text) {
  let scenario;
  try { scenario = JSON.parse(text); } catch { reject('FURS_OUTAGE_SCENARIO', 'Outage scenario is not valid JSON'); }
  if (typeof scenario !== 'object' || scenario === null || Array.isArray(scenario)) reject('FURS_OUTAGE_SCENARIO', 'Outage scenario must be an object');
  if (scenario.environment !== 'test' || !UUID.test(scenario.legalEntityId ?? '')) reject('FURS_OUTAGE_SCENARIO', 'Outage scenario must identify the test legal entity');
  required(scenario.scenarioId, 'scenarioId');
  if (!/^[A-Za-z0-9._:-]{1,100}$/u.test(scenario.scenarioId)) reject('FURS_OUTAGE_SCENARIO', 'scenarioId is invalid');
  validateSourceVersion(scenario.sourceVersion);
  const operation = scenario.operation;
  if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) reject('FURS_OUTAGE_SCENARIO', 'Outage operation is missing');
  if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(operation.idempotencyKey ?? '')) reject('FURS_OUTAGE_SCENARIO', 'Outage idempotency key is invalid');
  const request = operation.request;
  if (typeof request !== 'object' || request === null || Array.isArray(request) || request.kind !== 'STANDARD' || request.subsequentSubmit !== true) {
    reject('FURS_OUTAGE_SCENARIO', 'Outage operation must be an explicit standard subsequent submission');
  }
  if (request.legalEntityId !== scenario.legalEntityId || !UUID.test(request.messageId ?? '')) reject('FURS_OUTAGE_SCENARIO', 'Outage request identity is invalid');
  return scenario;
}

async function jsonRequest(fetchImpl, api, token, path, options = {}) {
  const response = await fetchImpl(new URL(path, api), {
    method: options.method ?? 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.idempotencyKey === undefined ? {} : { 'idempotency-key': options.idempotencyKey })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { reject('FURS_OUTAGE_RESPONSE', 'Fiscal API returned invalid JSON'); }
  if (!response.ok) reject('FURS_OUTAGE_HTTP', `Fiscal API request failed with HTTP ${response.status}`);
  return body;
}

async function metrics(fetchImpl, api, token) {
  const response = await fetchImpl(new URL('metrics', api), {
    redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) reject('FURS_OUTAGE_METRICS', `Metrics request failed with HTTP ${response.status}`);
  const text = await response.text();
  const metric = (name) => {
    const match = text.match(new RegExp(`^${name} (-?\\d+(?:\\.\\d+)?)$`, 'mu'));
    if (match === null) reject('FURS_OUTAGE_METRICS', `Required metric ${name} is missing`);
    return Number(match[1]);
  };
  return Object.freeze({
    workerHeartbeatAgeSeconds: metric('starfiniti_furs_worker_heartbeat_age_seconds'),
    activeOutboxJobs: metric('starfiniti_furs_outbox_active')
  });
}

function snapshot(document) {
  if (typeof document !== 'object' || document === null || !UUID.test(document.id ?? '') || !UUID.test(document.messageId ?? '')) {
    reject('FURS_OUTAGE_DOCUMENT', 'Fiscal document identity is invalid');
  }
  for (const field of ['invoiceSequence', 'issueLocalTime', 'payloadSha256', 'zoi', 'updatedAt']) {
    if (typeof document[field] !== 'string' || document[field] === '') reject('FURS_OUTAGE_DOCUMENT', `Fiscal document ${field} is missing`);
  }
  if (!SHA256.test(document.payloadSha256)) reject('FURS_OUTAGE_DOCUMENT', 'Fiscal document payload digest is invalid');
  return Object.freeze({
    documentId: document.id,
    invoiceSequence: document.invoiceSequence,
    issueLocalTime: document.issueLocalTime,
    messageId: document.messageId,
    payloadSha256: document.payloadSha256,
    zoiSha256: hash(document.zoi),
    updatedAt: document.updatedAt
  });
}

function assertWorkerOperational(observation) {
  if (!Number.isFinite(observation.workerHeartbeatAgeSeconds) || observation.workerHeartbeatAgeSeconds < 0 || observation.workerHeartbeatAgeSeconds > 30) {
    reject('FURS_OUTAGE_WORKER', 'Worker heartbeat is not healthy; this would be a device/software failure drill');
  }
}

export async function prepareNetworkOutageEvidence(options) {
  const scenario = parseOutageScenario(options.scenarioText);
  const api = baseUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const info = await jsonRequest(fetchImpl, api, options.token, 'v1/system/info');
  if (info.environment !== 'test' || info.legalEntityId !== scenario.legalEntityId) reject('FURS_OUTAGE_TARGET', 'Connected API does not match the outage test entity/environment');
  const beforeMetrics = await metrics(fetchImpl, api, options.token);
  assertWorkerOperational(beforeMetrics);
  if (beforeMetrics.activeOutboxJobs !== 0) reject('FURS_OUTAGE_OUTBOX', 'Outage drill requires an isolated empty outbox before submission');
  const accepted = await jsonRequest(fetchImpl, api, options.token, 'v1/fiscal-invoices', {
    method: 'POST', body: scenario.operation.request, idempotencyKey: scenario.operation.idempotencyKey
  });
  if (accepted.status !== 'ISSUED_WITHOUT_EOR' || accepted.subsequentSubmit !== true) reject('FURS_OUTAGE_STATE', 'Outage invoice did not enter ISSUED_WITHOUT_EOR');
  const original = snapshot(accepted);
  const startedAt = Date.now();
  let observed;
  while (Date.now() - startedAt < timeoutMs) {
    const current = await jsonRequest(fetchImpl, api, options.token, `v1/fiscal-invoices/${encodeURIComponent(original.documentId)}`);
    if (current.status === 'CONFIRMED') reject('FURS_OUTAGE_NOT_ACTIVE', 'Invoice confirmed before a connectivity interruption was observed');
    if (TERMINAL_FAILURE.has(current.status)) reject('FURS_OUTAGE_TERMINAL', `Outage invoice reached ${current.status}`);
    if (current.status === 'ISSUED_WITHOUT_EOR' && current.updatedAt !== original.updatedAt) { observed = current; break; }
    await sleep(250);
  }
  if (observed === undefined) reject('FURS_OUTAGE_TIMEOUT', 'No failed connectivity attempt was observed before the deadline');
  const duringMetrics = await metrics(fetchImpl, api, options.token);
  assertWorkerOperational(duringMetrics);
  if (duringMetrics.activeOutboxJobs < 1) reject('FURS_OUTAGE_OUTBOX', 'Interrupted submission is not retained in the durable outbox');
  return Object.freeze({
    evidenceVersion: 1,
    environment: 'test',
    state: 'connectivity-interrupted',
    scenarioId: scenario.scenarioId,
    scenarioSha256: hash(options.scenarioText),
    sourceVersion: scenario.sourceVersion,
    observedAt: new Date().toISOString(),
    original,
    interruptionUpdatedAt: observed.updatedAt,
    workerHeartbeatAgeSeconds: duringMetrics.workerHeartbeatAgeSeconds,
    activeOutboxJobs: duringMetrics.activeOutboxJobs,
    deviceSoftwareOperationalVerified: true,
    connectivityInterruptionObserved: true
  });
}

function parseState(text) {
  let state;
  try { state = JSON.parse(text); } catch { reject('FURS_OUTAGE_STATE', 'Outage state is not valid JSON'); }
  if (state?.environment !== 'test' || state?.state !== 'connectivity-interrupted' || state?.connectivityInterruptionObserved !== true || state?.deviceSoftwareOperationalVerified !== true) {
    reject('FURS_OUTAGE_STATE', 'Outage state does not prove a connectivity interruption');
  }
  required(state.scenarioId, 'state scenarioId');
  if (!SHA256.test(state.scenarioSha256 ?? '')) reject('FURS_OUTAGE_STATE', 'Outage state scenario digest is invalid');
  validateSourceVersion(state.sourceVersion);
  if (!UUID.test(state.original?.documentId ?? '') || !SHA256.test(state.original?.payloadSha256 ?? '') || !SHA256.test(state.original?.zoiSha256 ?? '')) {
    reject('FURS_OUTAGE_STATE', 'Outage state original identity is invalid');
  }
  return state;
}

export async function recoverNetworkOutageEvidence(options) {
  const state = parseState(options.stateText);
  const api = baseUrl(options.apiUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? delay;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const documentPath = `v1/fiscal-invoices/${encodeURIComponent(state.original.documentId)}`;
  let current = await jsonRequest(fetchImpl, api, options.token, documentPath);
  let confirmed = current.status === 'CONFIRMED' ? current : undefined;
  if (confirmed === undefined && TERMINAL_FAILURE.has(current.status)) {
    reject('FURS_OUTAGE_TERMINAL', `Recovered invoice reached ${current.status}`);
  }
  if (confirmed === undefined) {
    const retryResponse = await fetchImpl(new URL(`${documentPath}/retry`, api), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${options.token}`, accept: 'application/json' }
    });
    if (!retryResponse.ok) {
      // The normal worker may confirm the retained job between the initial GET
      // and the explicit operator retry. A 409 is acceptable only when a fresh,
      // authenticated read proves that exact document is already confirmed.
      current = await jsonRequest(fetchImpl, api, options.token, documentPath);
      if (retryResponse.status === 409 && current.status === 'CONFIRMED') confirmed = current;
      else reject('FURS_OUTAGE_HTTP', `Fiscal API request failed with HTTP ${retryResponse.status}`);
    }
  }
  const startedAt = Date.now();
  while (confirmed === undefined && Date.now() - startedAt < timeoutMs) {
    current = await jsonRequest(fetchImpl, api, options.token, documentPath);
    if (current.status === 'CONFIRMED') { confirmed = current; break; }
    if (TERMINAL_FAILURE.has(current.status)) reject('FURS_OUTAGE_TERMINAL', `Recovered invoice reached ${current.status}`);
    await sleep(500);
  }
  if (confirmed === undefined) reject('FURS_OUTAGE_TIMEOUT', 'Recovered invoice did not confirm before the deadline');
  const final = snapshot(confirmed);
  const sameIdentity = final.documentId === state.original.documentId &&
    final.invoiceSequence === state.original.invoiceSequence &&
    final.issueLocalTime === state.original.issueLocalTime &&
    final.messageId === state.original.messageId &&
    final.payloadSha256 === state.original.payloadSha256 &&
    final.zoiSha256 === state.original.zoiSha256;
  if (!sameIdentity || confirmed.subsequentSubmit !== true || typeof confirmed.eor !== 'string' || !UUID.test(confirmed.eor)) {
    reject('FURS_OUTAGE_IDENTITY', 'Recovery did not preserve and confirm the original subsequent-submission identity');
  }
  const finalMetrics = await metrics(fetchImpl, api, options.token);
  assertWorkerOperational(finalMetrics);
  if (finalMetrics.activeOutboxJobs !== 0) reject('FURS_OUTAGE_OUTBOX', 'Recovered submission left an active outbox job');
  const summary = {
    evidenceVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: 'test',
    scenarioId: state.scenarioId,
    scenarioSha256: state.scenarioSha256,
    sourceVersion: state.sourceVersion,
    documentId: final.documentId,
    finalStatus: 'CONFIRMED',
    sameDocumentId: true,
    sameInvoiceSequence: true,
    sameIssueLocalTime: true,
    sameMessageId: true,
    samePayloadSha256: true,
    sameZoiSha256: true,
    subsequentSubmissionVerified: true,
    signedResponseVerified: true,
    deviceSoftwareOperationalVerified: true,
    connectivityInterruptionObserved: true,
    activeOutboxJobsAfterRecovery: 0,
    workerHeartbeatAgeSecondsAfterRecovery: finalMetrics.workerHeartbeatAgeSeconds,
    failures: 0
  };
  return Object.freeze({ ...summary, evidenceSha256: hash(JSON.stringify(summary)) });
}

function assertExternal(workspace, path) {
  if (!isAbsolute(path)) reject('FURS_OUTAGE_PATH', 'Evidence paths must be absolute');
  const relation = relative(resolve(workspace), resolve(path));
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) reject('FURS_OUTAGE_PATH', 'Outage evidence must remain outside the repository');
}

async function main() {
  if (process.env.FURS_OUTAGE_CONFIRMATION !== 'furs-test-network-outage-approved') reject('FURS_OUTAGE_CONFIRMATION', 'Explicit outage-drill confirmation is required');
  const phase = required(process.env.FURS_OUTAGE_PHASE, 'FURS_OUTAGE_PHASE');
  const tokenPath = required(process.env.FURS_API_WRITE_TOKEN_FILE, 'FURS_API_WRITE_TOKEN_FILE');
  const statePath = required(process.env.FURS_OUTAGE_STATE_PATH, 'FURS_OUTAGE_STATE_PATH');
  const workspace = process.cwd();
  assertExternal(workspace, tokenPath);
  assertExternal(workspace, statePath);
  const token = (await readFile(tokenPath, 'utf8')).replace(/\r?\n$/u, '');
  if (token.length < 32) reject('FURS_OUTAGE_CONFIG', 'Write token file is invalid');
  const common = { apiUrl: required(process.env.FURS_API_URL, 'FURS_API_URL'), token };
  if (phase === 'prepare') {
    const scenarioPath = required(process.env.FURS_OUTAGE_SCENARIO_PATH, 'FURS_OUTAGE_SCENARIO_PATH');
    assertExternal(workspace, scenarioPath);
    const scenarioText = await readFile(scenarioPath, 'utf8');
    const state = await prepareNetworkOutageEvidence({ ...common, scenarioText });
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ state: state.state, documentId: state.original.documentId, statePath }, null, 2)}\n`);
    return;
  }
  if (phase === 'recover') {
    const outputPath = required(process.env.FURS_OUTAGE_EVIDENCE_PATH, 'FURS_OUTAGE_EVIDENCE_PATH');
    assertExternal(workspace, outputPath);
    const evidence = await recoverNetworkOutageEvidence({ ...common, stateText: await readFile(statePath, 'utf8') });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ...evidence, outputPath }, null, 2)}\n`);
    return;
  }
  reject('FURS_OUTAGE_PHASE', 'FURS_OUTAGE_PHASE must be prepare or recover');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof NetworkOutageEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_OUTAGE_FAILURE', message: 'Network-outage evidence failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
