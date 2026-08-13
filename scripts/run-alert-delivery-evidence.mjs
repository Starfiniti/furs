#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REQUIRED_ALERT_NAMES = Object.freeze([
  'FursCertificateExpiring',
  'FursClockDrift',
  'FursManualReviewPresent',
  'FursSubmissionBacklogOld',
  'FursWorkerHeartbeatMissing'
]);

const RELEASE_CATEGORIES = Object.freeze({
  FursCertificateExpiring: 'certificateExpiry',
  FursClockDrift: 'clockDrift',
  FursManualReviewPresent: 'manualReview',
  FursSubmissionBacklogOld: 'retryBacklog',
  FursWorkerHeartbeatMissing: 'workerHeartbeat'
});

const MAX_WEBHOOK_BYTES = 1_048_576;

export class AlertDeliveryEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function reject(code, message) { throw new AlertDeliveryEvidenceError(code, message); }

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') reject('FURS_ALERT_CONFIG', `${name} is required`);
  return value;
}

export function assertExternalEvidenceDirectory(workspacePath, evidencePath) {
  const workspace = resolve(required(workspacePath, 'workspacePath'));
  const evidence = resolve(required(evidencePath, 'evidencePath'));
  const relation = relative(workspace, evidence);
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    reject('FURS_ALERT_EVIDENCE_PATH', 'Alert evidence directory must be outside the repository');
  }
}

export function assertExecutableDigest(expected, actual) {
  if (!/^[a-f0-9]{64}$/u.test(expected ?? '') || !/^[a-f0-9]{64}$/u.test(actual ?? '')) {
    reject('FURS_ALERT_EXECUTABLE', 'Alertmanager executable SHA-256 is invalid');
  }
  if (expected !== actual) reject('FURS_ALERT_EXECUTABLE_CHANGED', 'Alertmanager executable SHA-256 changed');
}

export function buildAlertmanagerConfig(webhookUrl) {
  let url;
  try { url = new URL(webhookUrl); } catch { reject('FURS_ALERT_WEBHOOK', 'Webhook URL is invalid'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    reject('FURS_ALERT_WEBHOOK', 'Evidence webhook must be a credential-free loopback HTTP URL');
  }
  return [
    'global:',
    '  resolve_timeout: 1m',
    'route:',
    '  receiver: evidence-webhook',
    "  group_by: ['alertname']",
    '  group_wait: 0s',
    '  group_interval: 1s',
    '  repeat_interval: 1h',
    'receivers:',
    '  - name: evidence-webhook',
    '    webhook_configs:',
    `      - url: '${url.toString()}'`,
    '        send_resolved: false',
    ''
  ].join('\n');
}

export function summarizeAlertDelivery(input) {
  if (input.environment !== 'test') reject('FURS_ALERT_ENVIRONMENT', 'Alert delivery evidence must be labelled test');
  if (!/^[a-f0-9]{64}$/u.test(input.executableSha256 ?? '')) reject('FURS_ALERT_EXECUTABLE', 'Alertmanager executable SHA-256 is invalid');
  if (typeof input.alertmanagerVersion !== 'string' || !/^0\.\d+\.\d+$/u.test(input.alertmanagerVersion)) {
    reject('FURS_ALERT_VERSION', 'Alertmanager version is invalid');
  }
  const received = [...new Set(input.receivedAlertNames ?? [])].sort();
  const missing = REQUIRED_ALERT_NAMES.filter((name) => !received.includes(name));
  if (missing.length > 0) reject('FURS_ALERT_MISSING', `Missing required alert deliveries: ${missing.join(', ')}`);
  if (!Number.isSafeInteger(input.deliveryLatencyMilliseconds) || input.deliveryLatencyMilliseconds < 0) {
    reject('FURS_ALERT_LATENCY', 'Alert delivery latency is invalid');
  }
  if (!Number.isSafeInteger(input.deliveriesObserved) || input.deliveriesObserved < 1) {
    reject('FURS_ALERT_DELIVERIES', 'Alert delivery count is invalid');
  }
  const summary = {
    evidenceVersion: 1,
    generatedAt: required(input.generatedAt, 'generatedAt'),
    environment: 'test',
    deliveryScope: 'local-loopback-alertmanager',
    alertmanagerVersion: input.alertmanagerVersion,
    executableSha256: input.executableSha256,
    alertNames: received,
    fired: REQUIRED_ALERT_NAMES.map((name) => RELEASE_CATEGORIES[name]).sort(),
    deliveriesObserved: input.deliveriesObserved,
    deliveryLatencyMilliseconds: input.deliveryLatencyMilliseconds,
    allRequiredDelivered: true,
    productionRoutingVerified: false
  };
  return Object.freeze({
    ...summary,
    evidenceSha256: createHash('sha256').update(JSON.stringify(summary), 'utf8').digest('hex')
  });
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) reject('FURS_ALERT_RECEIVER', 'Webhook receiver did not expose a TCP address');
  return address.port;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}

async function reservePort() {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function executableVersion(executablePath) {
  const child = spawn(executablePath, ['--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code));
  });
  if (exitCode !== 0) reject('FURS_ALERT_EXECUTABLE', 'Alertmanager version command failed');
  const match = output.match(/alertmanager, version (0\.\d+\.\d+)/u);
  if (match === null) reject('FURS_ALERT_VERSION', 'Alertmanager version output is unrecognized');
  return match[1];
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function waitReady(baseUrl, child, timeoutMs, launchState) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (launchState.failed || child.exitCode !== null) reject('FURS_ALERT_STARTUP', 'Alertmanager exited before readiness');
    try {
      const response = await fetch(new URL('/-/ready', baseUrl), { signal: AbortSignal.timeout(1_000), redirect: 'error' });
      if (response.ok) return;
    } catch { /* retry until the bounded deadline */ }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  reject('FURS_ALERT_STARTUP', 'Alertmanager did not become ready before the deadline');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

export async function runAlertDeliveryEvidence(options) {
  if (options.environment !== 'test') reject('FURS_ALERT_ENVIRONMENT', 'Alert delivery evidence may run only in test');
  const executablePath = required(options.executablePath, 'executablePath');
  const workDirectory = required(options.workDirectory, 'workDirectory');
  if (!isAbsolute(executablePath) || !isAbsolute(workDirectory)) reject('FURS_ALERT_CONFIG', 'Executable and work directory paths must be absolute');
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 120_000) reject('FURS_ALERT_CONFIG', 'timeoutMs is invalid');
  await mkdir(workDirectory, { recursive: true });
  const executableSha256 = await sha256File(executablePath);
  assertExecutableDigest(required(options.expectedExecutableSha256, 'expectedExecutableSha256'), executableSha256);
  const alertmanagerVersion = await executableVersion(executablePath);

  const receivedAlertNames = [];
  let deliveriesObserved = 0;
  let firstReceivedAt;
  const receiver = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/alerts') { response.writeHead(404).end(); return; }
    let bytes = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_WEBHOOK_BYTES) chunks.push(chunk);
    });
    request.on('end', () => {
      if (bytes > MAX_WEBHOOK_BYTES) { response.writeHead(413).end(); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!Array.isArray(body.alerts)) throw new Error('alerts missing');
        for (const alert of body.alerts) {
          if (typeof alert?.labels?.alertname === 'string') receivedAlertNames.push(alert.labels.alertname);
        }
        deliveriesObserved += 1;
        firstReceivedAt ??= Date.now();
        response.writeHead(200).end();
      } catch { response.writeHead(400).end(); }
    });
  });

  let child;
  try {
    const receiverPort = await listen(receiver);
    const alertmanagerPort = await reservePort();
    const configPath = join(workDirectory, 'alertmanager-evidence.yml');
    const storagePath = join(workDirectory, 'storage');
    await mkdir(storagePath, { recursive: true });
    await writeFile(configPath, buildAlertmanagerConfig(`http://127.0.0.1:${receiverPort}/alerts`), { encoding: 'utf8', mode: 0o600 });
    child = spawn(executablePath, [
      `--config.file=${configPath}`,
      `--storage.path=${storagePath}`,
      `--web.listen-address=127.0.0.1:${alertmanagerPort}`,
      '--log.level=warn'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    const launchState = { failed: false };
    child.once('error', () => { launchState.failed = true; });
    const alertmanagerUrl = new URL(`http://127.0.0.1:${alertmanagerPort}`);
    await waitReady(alertmanagerUrl, child, timeoutMs, launchState);

    const sentAt = Date.now();
    const startsAt = new Date(sentAt).toISOString();
    const endsAt = new Date(sentAt + 300_000).toISOString();
    const alerts = REQUIRED_ALERT_NAMES.map((alertname) => ({
      labels: {
        alertname,
        severity: alertname === 'FursCertificateExpiring' || alertname === 'FursManualReviewPresent' ? 'warning' : 'critical',
        service: 'starfiniti-furs',
        environment: 'test',
        evidence_run: randomUUID()
      },
      annotations: { summary: 'Synthetic Starfiniti FURS alert-routing evidence' },
      startsAt,
      endsAt,
      generatorURL: 'http://127.0.0.1/evidence'
    }));
    const response = await fetch(new URL('/api/v2/alerts', alertmanagerUrl), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(alerts)
    });
    if (!response.ok) reject('FURS_ALERT_SUBMIT', `Alertmanager rejected evidence alerts with HTTP ${response.status}`);

    while (Date.now() - sentAt < timeoutMs) {
      if (REQUIRED_ALERT_NAMES.every((name) => receivedAlertNames.includes(name))) break;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
    }
    return summarizeAlertDelivery({
      environment: 'test',
      generatedAt: new Date().toISOString(),
      alertmanagerVersion,
      executableSha256,
      receivedAlertNames,
      deliveriesObserved,
      deliveryLatencyMilliseconds: firstReceivedAt === undefined ? timeoutMs : firstReceivedAt - sentAt
    });
  } finally {
    if (child !== undefined) await stopChild(child);
    await closeServer(receiver);
  }
}

async function main() {
  if (process.env.FURS_ALERT_DELIVERY_CONFIRMATION !== 'furs-alert-routing-approved') {
    reject('FURS_ALERT_CONFIRMATION', 'Explicit alert-routing evidence confirmation is required');
  }
  const evidenceRoot = required(process.env.FURS_ALERT_EVIDENCE_DIR, 'FURS_ALERT_EVIDENCE_DIR');
  assertExternalEvidenceDirectory(process.cwd(), evidenceRoot);
  const runId = new Date().toISOString().replace(/[-:.TZ]/gu, '');
  const runDirectory = join(evidenceRoot, `alert-delivery-${runId}`);
  const evidence = await runAlertDeliveryEvidence({
    environment: 'test',
    executablePath: required(process.env.FURS_ALERTMANAGER_EXECUTABLE_PATH, 'FURS_ALERTMANAGER_EXECUTABLE_PATH'),
    expectedExecutableSha256: required(process.env.FURS_ALERTMANAGER_EXECUTABLE_SHA256, 'FURS_ALERTMANAGER_EXECUTABLE_SHA256'),
    workDirectory: runDirectory
  });
  const outputPath = join(runDirectory, 'evidence.json');
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ...evidence, outputPath }, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof AlertDeliveryEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_ALERT_FAILURE', message: 'Alert delivery evidence failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
