#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TERMINAL = new Set(['CONFIRMED', 'REJECTED', 'MANUAL_REVIEW']);
const MAX_RESPONSE_CHARACTERS = 1_048_576;

class EvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new EvidenceError('FURS_EVIDENCE_CONFIG', `${name} is required`);
  return value;
}

function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new EvidenceError('FURS_EVIDENCE_URL', 'FURS_API_URL is invalid'); }
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new EvidenceError('FURS_EVIDENCE_URL', 'Evidence API must use HTTPS or loopback HTTP');
  if (url.username || url.password || url.search || url.hash) throw new EvidenceError('FURS_EVIDENCE_URL', 'Evidence API URL must not contain credentials, query or fragment');
  return new URL(url.pathname.endsWith('/') ? url : `${url.toString()}/`);
}

function validateScenario(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new EvidenceError('FURS_EVIDENCE_SCENARIO', 'Scenario must be an object');
  const scenario = value;
  if (scenario.environment !== 'test') throw new EvidenceError('FURS_EVIDENCE_ENVIRONMENT', 'Evidence scenarios must target the FURS test environment');
  required(scenario.scenarioId, 'scenarioId');
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(scenario.scenarioId)) throw new EvidenceError('FURS_EVIDENCE_SCENARIO', 'scenarioId is invalid');
  if (typeof scenario.legalEntityId !== 'string' || !/^[a-fA-F0-9-]{36}$/.test(scenario.legalEntityId)) throw new EvidenceError('FURS_EVIDENCE_SCENARIO', 'legalEntityId is invalid');
  if (scenario.sourceVersion?.technicalDocumentation !== '3.2' || !/^[a-f0-9]{64}$/.test(scenario.sourceVersion?.schemaSha256 ?? '')) {
    throw new EvidenceError('FURS_EVIDENCE_SOURCE', 'Scenario source version is invalid');
  }
  if (!Array.isArray(scenario.operations) || scenario.operations.length > 100) throw new EvidenceError('FURS_EVIDENCE_SCENARIO', 'operations must be an array with at most 100 entries');
  for (const operation of scenario.operations) {
    if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) throw new EvidenceError('FURS_EVIDENCE_OPERATION', 'Every operation must be an object');
    if (!['fiscal-invoice', 'business-premise'].includes(operation.kind)) throw new EvidenceError('FURS_EVIDENCE_OPERATION', 'Operation kind is unsupported');
    required(operation.idempotencyKey, 'operation.idempotencyKey');
    if (typeof operation.request !== 'object' || operation.request === null || Array.isArray(operation.request)) throw new EvidenceError('FURS_EVIDENCE_OPERATION', 'Operation request must be an object');
    if (!['CONFIRMED', 'REJECTED', 'MANUAL_REVIEW'].includes(operation.expectedTerminalStatus)) throw new EvidenceError('FURS_EVIDENCE_OPERATION', 'Expected terminal status is invalid');
    if (operation.kind === 'business-premise' && !['POST', 'PATCH'].includes(operation.method ?? 'POST')) throw new EvidenceError('FURS_EVIDENCE_OPERATION', 'Premise method must be POST or PATCH');
  }
  return scenario;
}

async function jsonRequest(fetchImpl, baseUrl, token, path, options = {}) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    headers: {
      accept: 'application/json', authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.idempotencyKey === undefined ? {} : { 'idempotency-key': options.idempotencyKey })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARACTERS) throw new EvidenceError('FURS_EVIDENCE_RESPONSE_SIZE', 'API response exceeds evidence limit');
  let body;
  try { body = JSON.parse(text); } catch { throw new EvidenceError('FURS_EVIDENCE_RESPONSE_JSON', 'API returned invalid JSON'); }
  if (!response.ok) throw new EvidenceError('FURS_EVIDENCE_HTTP', `API request failed with HTTP ${response.status}`);
  return body;
}

function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

export async function runFursEvidence(options) {
  const scenarioText = options.scenarioText;
  const scenario = validateScenario(JSON.parse(scenarioText));
  const baseUrl = safeUrl(options.baseUrl);
  if (typeof options.token !== 'string' || options.token.length < 32) throw new EvidenceError('FURS_EVIDENCE_CONFIG', 'API write token is invalid');
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 7_200_000) throw new EvidenceError('FURS_EVIDENCE_CONFIG', 'Evidence timeout is invalid');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 60_000) throw new EvidenceError('FURS_EVIDENCE_CONFIG', 'Evidence poll interval is invalid');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  const info = await jsonRequest(fetchImpl, baseUrl, options.token, 'v1/system/info');
  if (info.environment !== 'test') throw new EvidenceError('FURS_EVIDENCE_ENVIRONMENT', 'Connected API is not configured for the FURS test environment');
  if (scenario.legalEntityId !== info.legalEntityId) throw new EvidenceError('FURS_EVIDENCE_ENTITY', 'Scenario legal entity does not match the connected API');

  const echoValue = `evidence-${digest(scenario.scenarioId).slice(0, 24)}`;
  const echo = await jsonRequest(fetchImpl, baseUrl, options.token, 'v1/furs/echo', { method: 'POST', body: { value: echoValue } });
  if (echo.value !== echoValue) throw new EvidenceError('FURS_EVIDENCE_ECHO', 'Verified echo value did not match');

  const results = [];
  for (const [index, operation] of scenario.operations.entries()) {
    const path = operation.kind === 'fiscal-invoice'
      ? 'v1/fiscal-invoices'
      : operation.method === 'PATCH'
        ? `v1/business-premises/${encodeURIComponent(required(operation.pathId, 'operation.pathId'))}`
        : 'v1/business-premises';
    const accepted = await jsonRequest(fetchImpl, baseUrl, options.token, path, {
      method: operation.method ?? 'POST', body: operation.request, idempotencyKey: operation.idempotencyKey
    });
    const startedAt = Date.now();
    let document = accepted;
    while (!TERMINAL.has(document.status)) {
      if (Date.now() - startedAt >= timeoutMs) throw new EvidenceError('FURS_EVIDENCE_TIMEOUT', 'Fiscal operation did not reach a terminal state');
      await sleep(pollIntervalMs);
      document = await jsonRequest(fetchImpl, baseUrl, options.token, `v1/fiscal-invoices/${encodeURIComponent(document.id)}`);
    }
    if (document.status !== operation.expectedTerminalStatus) throw new EvidenceError('FURS_EVIDENCE_OUTCOME', 'Fiscal operation reached an unexpected terminal state');
    results.push(Object.freeze({
      index, kind: operation.kind, documentId: document.id, status: document.status,
      payloadSha256: document.payloadSha256,
      ...(typeof document.zoi === 'string' ? { zoiSha256: digest(document.zoi) } : {}),
      ...(typeof document.eor === 'string' ? { eorSha256: digest(document.eor) } : {}),
      issueLocalTime: document.issueLocalTime, confirmedAt: document.confirmedAt ?? null
    }));
  }
  return Object.freeze({
    evidenceVersion: 1, generatedAt: new Date().toISOString(), environment: 'test',
    scenarioId: scenario.scenarioId, scenarioSha256: digest(scenarioText),
    sourceVersion: Object.freeze({
      technicalDocumentation: '3.2', schemaSha256: scenario.sourceVersion.schemaSha256
    }), legalEntityId: info.legalEntityId,
    echo: 'verified', operations: Object.freeze(results)
  });
}

async function main() {
  const scenarioPath = required(process.env.FURS_EVIDENCE_SCENARIO_PATH, 'FURS_EVIDENCE_SCENARIO_PATH');
  const tokenPath = required(process.env.FURS_API_WRITE_TOKEN_FILE, 'FURS_API_WRITE_TOKEN_FILE');
  const [scenarioText, tokenText] = await Promise.all([readFile(scenarioPath, 'utf8'), readFile(tokenPath, 'utf8')]);
  const token = tokenText.replace(/\r?\n$/, '');
  if (token.length < 32) throw new EvidenceError('FURS_EVIDENCE_CONFIG', 'API write token file is invalid');
  const evidence = await runFursEvidence({
    scenarioText, token, baseUrl: required(process.env.FURS_API_URL, 'FURS_API_URL'),
    timeoutMs: process.env.FURS_EVIDENCE_TIMEOUT_MS === undefined ? undefined : Number(process.env.FURS_EVIDENCE_TIMEOUT_MS)
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof EvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_EVIDENCE_FAILURE', message: 'FURS evidence run failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
