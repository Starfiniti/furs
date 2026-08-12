#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFursEvidence } from './run-furs-evidence.mjs';

class SoakEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function ljubljanaLocalTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function cycleScenario(base, cycle, now) {
  const operations = base.operations
    .filter((operation) => cycle === 0 || operation.repeatEachCycle === true)
    .map((operation) => {
      const idempotencyKey = `${operation.idempotencyKey}:soak:${cycle}`;
      if (idempotencyKey.length > 128) throw new SoakEvidenceError('FURS_SOAK_IDEMPOTENCY', 'Soak idempotency key exceeds 128 characters');
      return {
        kind: operation.kind, idempotencyKey, expectedTerminalStatus: operation.expectedTerminalStatus,
        ...(operation.method === undefined ? {} : { method: operation.method }),
        ...(operation.pathId === undefined ? {} : { pathId: operation.pathId }),
        request: {
          ...operation.request, messageId: randomUUID(),
          ...(operation.kind === 'fiscal-invoice' ? { issueLocalTime: ljubljanaLocalTime(now) } : { sentAt: ljubljanaLocalTime(now) })
        }
      };
    });
  return JSON.stringify({
    environment: 'test', scenarioId: `${String(base.scenarioId).slice(0, 80)}-cycle-${cycle}`,
    legalEntityId: base.legalEntityId, sourceVersion: base.sourceVersion, operations
  });
}

export async function runFursSoak(options) {
  let base;
  try { base = JSON.parse(options.scenarioText); } catch { throw new SoakEvidenceError('FURS_SOAK_SCENARIO', 'Soak scenario is invalid JSON'); }
  if (!Array.isArray(base.operations) || !base.operations.some((operation) => operation.kind === 'fiscal-invoice' && operation.repeatEachCycle === true)) {
    throw new SoakEvidenceError('FURS_SOAK_SCENARIO', 'Soak scenario needs a repeatEachCycle fiscal invoice');
  }
  const durationMs = options.durationMs ?? 172_800_000;
  const intervalMs = options.intervalMs ?? 900_000;
  if (!Number.isSafeInteger(durationMs) || durationMs < 1_000 || durationMs > 604_800_000) throw new SoakEvidenceError('FURS_SOAK_CONFIG', 'Soak duration is invalid');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 86_400_000) throw new SoakEvidenceError('FURS_SOAK_CONFIG', 'Soak interval is invalid');
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  const runCycle = options.runCycle ?? runFursEvidence;
  const startedAt = now();
  let chain = '0'.repeat(64);
  let cycles = 0;
  let operations = 0;
  while (now().getTime() - startedAt.getTime() < durationMs && cycles < (options.maximumCycles ?? Number.MAX_SAFE_INTEGER)) {
    const cycleStarted = now();
    const scenarioText = cycleScenario(base, cycles, cycleStarted);
    const evidence = await runCycle({
      scenarioText, token: options.token, baseUrl: options.baseUrl,
      timeoutMs: options.operationTimeoutMs ?? 300_000
    });
    chain = createHash('sha256').update(`${chain}.${JSON.stringify(evidence)}`, 'utf8').digest('hex');
    operations += evidence.operations.length;
    cycles += 1;
    const remaining = durationMs - (now().getTime() - startedAt.getTime());
    if (remaining > 0 && cycles < (options.maximumCycles ?? Number.MAX_SAFE_INTEGER)) await sleep(Math.min(intervalMs, remaining));
  }
  if (cycles === 0) throw new SoakEvidenceError('FURS_SOAK_EMPTY', 'Soak produced no evidence cycles');
  return Object.freeze({
    evidenceVersion: 1, environment: 'test', startedAt: startedAt.toISOString(), finishedAt: now().toISOString(),
    requestedDurationMs: durationMs, intervalMs, cycles, operations, allCyclesPassed: true, evidenceChainSha256: chain
  });
}

async function main() {
  const scenarioPath = process.env.FURS_EVIDENCE_SCENARIO_PATH;
  const tokenPath = process.env.FURS_API_WRITE_TOKEN_FILE;
  const baseUrl = process.env.FURS_API_URL;
  if (!scenarioPath || !tokenPath || !baseUrl) throw new SoakEvidenceError('FURS_SOAK_CONFIG', 'Scenario, API URL and write-token file are required');
  const [scenarioText, tokenText] = await Promise.all([readFile(scenarioPath, 'utf8'), readFile(tokenPath, 'utf8')]);
  const evidence = await runFursSoak({
    scenarioText, token: tokenText.replace(/\r?\n$/, ''), baseUrl,
    durationMs: process.env.FURS_SOAK_DURATION_MS === undefined ? undefined : Number(process.env.FURS_SOAK_DURATION_MS),
    intervalMs: process.env.FURS_SOAK_INTERVAL_MS === undefined ? undefined : Number(process.env.FURS_SOAK_INTERVAL_MS)
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof SoakEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_SOAK_FAILURE', message: 'FURS soak evidence run failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
