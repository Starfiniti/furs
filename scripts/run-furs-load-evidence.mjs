#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 = '7f645a0f96e8e8a28cceca462807000031c79c87a5402d98500e35f9cf001547';
const OFFICIAL_SCHEMA_SHA256 = '6b55de4b225470ed508e59bd2fac335e697624d21e9c940b145c6d55a5305ddd';

class LoadEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function localTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function validate(options) {
  let scenario;
  try { scenario = JSON.parse(options.scenarioText); } catch { throw new LoadEvidenceError('FURS_LOAD_SCENARIO', 'Load scenario is invalid JSON'); }
  if (options.confirmation !== 'furs-test-load-approved') throw new LoadEvidenceError('FURS_LOAD_GUARD', 'Explicit FURS test load confirmation is missing');
  if (scenario.environment !== 'test' || scenario.request?.kind !== 'STANDARD' || scenario.request?.subsequentSubmit === true) {
    throw new LoadEvidenceError('FURS_LOAD_SCENARIO', 'Load scenario must be an ordinary standard invoice in test');
  }
  if (
    scenario.sourceVersion?.technicalDocumentation !== '3.2' ||
    scenario.sourceVersion?.technicalDocumentationSha256 !== OFFICIAL_TECHNICAL_DOCUMENTATION_SHA256 ||
    scenario.sourceVersion?.schemaSha256 !== OFFICIAL_SCHEMA_SHA256
  ) {
    throw new LoadEvidenceError('FURS_LOAD_SOURCE', 'Load scenario is not pinned to the reviewed official source versions');
  }
  if (typeof scenario.reviewedBy !== 'string' || !scenario.reviewedBy.trim() || typeof scenario.policyVersion !== 'string' || !scenario.policyVersion.trim()) {
    throw new LoadEvidenceError('FURS_LOAD_REVIEW', 'Load scenario requires reviewer and policy version');
  }
  if (!/^[A-Za-z0-9._:-]{1,50}$/.test(scenario.policyVersion) || !['CONFIRMED', 'REJECTED', 'MANUAL_REVIEW'].includes(scenario.expectedTerminalStatus)) {
    throw new LoadEvidenceError('FURS_LOAD_REVIEW', 'Load policy version or expected outcome is invalid');
  }
  if (typeof scenario.expectedPeakPerSecond !== 'number' || !Number.isFinite(scenario.expectedPeakPerSecond) || scenario.expectedPeakPerSecond <= 0 || scenario.expectedPeakPerSecond > 1000) {
    throw new LoadEvidenceError('FURS_LOAD_REVIEW', 'Load scenario requires a reviewed expected peak per second');
  }
  if (typeof scenario.request.legalEntityId !== 'string' || !/^[a-fA-F0-9-]{36}$/.test(scenario.request.legalEntityId)) {
    throw new LoadEvidenceError('FURS_LOAD_SCENARIO', 'Load legal entity is invalid');
  }
  const total = options.total ?? 30;
  const concurrency = options.concurrency ?? 3;
  if (!Number.isSafeInteger(total) || total < 1 || total > 1000 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 20 || concurrency > total) {
    throw new LoadEvidenceError('FURS_LOAD_CONFIG', 'Load total/concurrency is invalid');
  }
  return { scenario, total, concurrency };
}

function baseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new LoadEvidenceError('FURS_LOAD_URL', 'FURS_API_URL is invalid'); }
  const loopback = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new LoadEvidenceError('FURS_LOAD_URL', 'Load API must use HTTPS or loopback HTTP');
  if (url.username || url.password || url.search || url.hash) throw new LoadEvidenceError('FURS_LOAD_URL', 'Load API URL must not contain credentials, query or fragment');
  return new URL(url.pathname.endsWith('/') ? url : `${url.toString()}/`);
}

async function api(fetchImpl, root, token, path, init = {}) {
  const response = await fetchImpl(new URL(path, root), {
    method: init.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}), ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  let body;
  try { body = await response.json(); } catch { throw new LoadEvidenceError('FURS_LOAD_RESPONSE', 'Load API returned invalid JSON'); }
  if (!response.ok) throw new LoadEvidenceError('FURS_LOAD_HTTP', `Load API returned HTTP ${response.status}`);
  return body;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

export async function runFursLoadEvidence(options) {
  const { scenario, total, concurrency } = validate(options);
  if (typeof options.token !== 'string' || options.token.length < 32) throw new LoadEvidenceError('FURS_LOAD_CONFIG', 'API write token is invalid');
  const root = baseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  const nowMilliseconds = options.nowMilliseconds ?? (() => performance.now());
  const info = await api(fetchImpl, root, options.token, 'v1/system/info');
  if (info.environment !== 'test' || info.legalEntityId !== scenario.request.legalEntityId) throw new LoadEvidenceError('FURS_LOAD_ENVIRONMENT', 'Connected API does not match the test load scenario');
  const requiredPerSecond = scenario.expectedPeakPerSecond * 3;
  const minimumApiRequestsPerMinute = Math.ceil(requiredPerSecond * 60 * 2);
  if (!Number.isSafeInteger(info.apiMaximumRequestsPerMinute) || info.apiMaximumRequestsPerMinute < minimumApiRequestsPerMinute) {
    throw new LoadEvidenceError('FURS_LOAD_RATE_LIMIT', 'API request limit is below the minimum required for the reviewed load target');
  }
  const echoValue = `load-${createHash('sha256').update(scenario.policyVersion).digest('hex').slice(0, 24)}`;
  const echo = await api(fetchImpl, root, options.token, 'v1/furs/echo', { method: 'POST', body: { value: echoValue } });
  if (echo.value !== echoValue) throw new LoadEvidenceError('FURS_LOAD_ECHO', 'Load preflight echo failed');
  let next = 0;
  const samples = [];
  const loadStarted = nowMilliseconds();
  const execute = async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const request = { ...scenario.request, messageId: randomUUID(), issueLocalTime: localTime(new Date()) };
      const idempotencyKey = `load:${scenario.policyVersion}:${index}:${randomUUID()}`;
      const started = nowMilliseconds();
      let document = await api(fetchImpl, root, options.token, 'v1/fiscal-invoices', {
        method: 'POST', body: request, headers: { 'idempotency-key': idempotencyKey }
      });
      while (!['CONFIRMED', 'REJECTED', 'MANUAL_REVIEW'].includes(document.status)) {
        await sleep(options.pollIntervalMs ?? 250);
        document = await api(fetchImpl, root, options.token, `v1/fiscal-invoices/${encodeURIComponent(document.id)}`);
      }
      if (document.status !== scenario.expectedTerminalStatus) throw new LoadEvidenceError('FURS_LOAD_OUTCOME', 'Load operation reached an unexpected terminal status');
      samples.push({
        durationMs: nowMilliseconds() - started, documentId: document.id,
        identity: `${document.businessPremiseId}/${document.electronicDeviceId}/${document.invoiceSequence}`,
        status: document.status
      });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, execute));
  const elapsedMilliseconds = Math.max(1, nowMilliseconds() - loadStarted);
  if (new Set(samples.map((sample) => sample.documentId)).size !== total) throw new LoadEvidenceError('FURS_LOAD_DUPLICATE_DOCUMENT', 'Load returned duplicate fiscal documents');
  if (new Set(samples.map((sample) => sample.identity)).size !== total) throw new LoadEvidenceError('FURS_LOAD_DUPLICATE_IDENTITY', 'Load returned duplicate fiscal identities');
  const durations = samples.map((sample) => sample.durationMs);
  const achievedPerSecond = total / (elapsedMilliseconds / 1000);
  const summary = {
    evidenceVersion: 1, generatedAt: new Date().toISOString(), environment: 'test',
    scenarioSha256: createHash('sha256').update(options.scenarioText).digest('hex'),
    policyVersionSha256: createHash('sha256').update(scenario.policyVersion).digest('hex'),
    sourceVersion: scenario.sourceVersion,
    total, concurrency, terminalStatus: scenario.expectedTerminalStatus,
    uniqueDocuments: total, uniqueFiscalIdentities: total, duplicateIdentities: 0,
    expectedPeakPerSecond: scenario.expectedPeakPerSecond,
    requiredPerSecond,
    apiMaximumRequestsPerMinute: info.apiMaximumRequestsPerMinute,
    minimumApiRequestsPerMinute,
    achievedPerSecond: Math.round(achievedPerSecond * 1000) / 1000,
    targetMultiplier: 3,
    targetAchieved: achievedPerSecond >= requiredPerSecond,
    elapsedMilliseconds: Math.round(elapsedMilliseconds),
    latencyMilliseconds: {
      minimum: Math.round(Math.min(...durations)), p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)), maximum: Math.round(Math.max(...durations))
    }
  };
  return Object.freeze({ ...summary, evidenceSha256: createHash('sha256').update(JSON.stringify(summary)).digest('hex') });
}

async function main() {
  const scenarioPath = process.env.FURS_LOAD_SCENARIO_PATH;
  const tokenPath = process.env.FURS_API_WRITE_TOKEN_FILE;
  const apiUrl = process.env.FURS_API_URL;
  if (!scenarioPath || !tokenPath || !apiUrl) throw new LoadEvidenceError('FURS_LOAD_CONFIG', 'Scenario, API URL and write-token file are required');
  const [scenarioText, tokenText] = await Promise.all([readFile(scenarioPath, 'utf8'), readFile(tokenPath, 'utf8')]);
  const evidence = await runFursLoadEvidence({
    scenarioText, token: tokenText.replace(/\r?\n$/, ''), baseUrl: apiUrl,
    confirmation: process.env.FURS_LOAD_CONFIRMATION,
    total: process.env.FURS_LOAD_TOTAL === undefined ? undefined : Number(process.env.FURS_LOAD_TOTAL),
    concurrency: process.env.FURS_LOAD_CONCURRENCY === undefined ? undefined : Number(process.env.FURS_LOAD_CONCURRENCY)
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.targetAchieved) throw new LoadEvidenceError('FURS_LOAD_THROUGHPUT', 'Load evidence did not reach three times the reviewed expected peak');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof LoadEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_LOAD_FAILURE', message: 'FURS load evidence failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
