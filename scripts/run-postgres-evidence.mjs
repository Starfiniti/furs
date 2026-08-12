#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BusinessPremiseId, ElectronicDeviceId, FiscalInvoiceIdentity, IdempotencyKey,
  InvoiceSequence, MessageId, PinnedOfficialSchemaValidator, PreparedFiscalCommand,
  ValidatedFursPayload, Zoi
} from '../packages/core/dist/index.js';
import {
  createPostgresPool, PgPoolDatabase, PostgresFiscalRepository, runMigrations
} from '../packages/persistence-postgres/dist/index.js';

class PostgresEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function assertEvidenceDatabase(connectionString, confirmation) {
  let url;
  try { url = new URL(connectionString); } catch { throw new PostgresEvidenceError('FURS_PG_EVIDENCE_URL', 'Evidence DATABASE_URL is invalid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new PostgresEvidenceError('FURS_PG_EVIDENCE_URL', 'Evidence database URL must use PostgreSQL');
  if (decodeURIComponent(url.pathname) !== '/furs_evidence' || confirmation !== 'furs_evidence') {
    throw new PostgresEvidenceError('FURS_PG_EVIDENCE_GUARD', 'Refusing to run outside the dedicated furs_evidence database');
  }
}

function fixtureCommand(entityId, premiseCode, deviceCode, sequence) {
  const schemaBytes = Buffer.from(JSON.stringify({ type: 'object', required: ['InvoiceRequest'] }));
  const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
    schemaBytes, createHash('sha256').update(schemaBytes).digest('hex')
  );
  const payload = ValidatedFursPayload.fromJson('{"InvoiceRequest":{"Evidence":"postgres"}}', validator);
  return PreparedFiscalCommand.create({
    operationId: randomUUID(), legalEntityId: entityId,
    idempotencyKey: IdempotencyKey.parse(`evidence:document:${randomUUID()}`), kind: 'STANDARD',
    identity: new FiscalInvoiceIdentity(
      BusinessPremiseId.parse(premiseCode), ElectronicDeviceId.parse(deviceCode), InvoiceSequence.parse(sequence)
    ),
    messageId: MessageId.parse(randomUUID()), payload, zoi: Zoi.parse('1da0adb4cc87fd85f909e0acb99a2aa4'),
    issueDateTime: '2026-08-12T12:34:56'
  });
}

export async function runPostgresEvidence(options) {
  assertEvidenceDatabase(options.connectionString, options.confirmation);
  const poolOne = createPostgresPool({ connectionString: options.connectionString, password: options.password, max: 16 });
  const poolTwo = createPostgresPool({ connectionString: options.connectionString, password: options.password, max: 16 });
  const databaseOne = new PgPoolDatabase(poolOne);
  const databaseTwo = new PgPoolDatabase(poolTwo);
  try {
    await runMigrations(databaseOne);
    const preflight = await databaseOne.query('select count(*)::int as count from furs.fiscal_documents');
    if (preflight.rows[0]?.count !== 0) {
      throw new PostgresEvidenceError('FURS_PG_EVIDENCE_NOT_EMPTY', 'Dedicated evidence database must be newly created and empty');
    }
    const repositoryOne = new PostgresFiscalRepository(databaseOne);
    const repositoryTwo = new PostgresFiscalRepository(databaseTwo);
    const entityId = randomUUID();
    const premiseRecordId = randomUUID();
    const deviceRecordId = randomUUID();
    const suffix = entityId.replaceAll('-', '').slice(0, 10).toUpperCase();
    const premiseCode = `P${suffix}`;
    const deviceCode = `D${suffix}`;
    await repositoryOne.createLegalEntity({
      id: entityId, taxNumber: String(randomInt(10_000_000, 100_000_000)), legalName: 'PostgreSQL evidence entity'
    });
    await repositoryOne.upsertBusinessPremise({
      id: premiseRecordId, legalEntityId: entityId, businessPremiseId: premiseCode,
      lifecycleStatus: 'REGISTERED', locationSnapshot: { evidence: true }, validityDate: '2026-08-12'
    });
    await repositoryOne.upsertElectronicDevice({
      id: deviceRecordId, legalEntityId: entityId, businessPremiseRecordId: premiseRecordId,
      electronicDeviceId: deviceCode
    });

    const stableKey = `evidence:stable:${randomUUID()}`;
    const stable = await Promise.all(Array.from({ length: 64 }, (_, index) =>
      (index % 2 === 0 ? repositoryOne : repositoryTwo).reserveInvoiceSequence(entityId, premiseCode, deviceCode, stableKey)
    ));
    assert.equal(new Set(stable).size, 1, 'Concurrent idempotent reservation returned multiple sequences');

    const allocated = await Promise.all(Array.from({ length: 128 }, (_, index) =>
      (index % 2 === 0 ? repositoryOne : repositoryTwo).allocateInvoiceSequence(entityId, premiseCode, deviceCode)
    ));
    assert.equal(new Set(allocated).size, allocated.length, 'Concurrent allocations duplicated a sequence');

    const commandSequence = await repositoryOne.allocateInvoiceSequence(entityId, premiseCode, deviceCode);
    const prepared = await repositoryOne.prepareFiscalCommand(fixtureCommand(entityId, premiseCode, deviceCode, commandSequence));
    const [claimOne, claimTwo] = await Promise.all([
      repositoryOne.claimOutboxJobs(`evidence-a-${suffix}`, 1),
      repositoryTwo.claimOutboxJobs(`evidence-b-${suffix}`, 1)
    ]);
    const claims = [...claimOne, ...claimTwo];
    assert.equal(claims.length, 1, 'Two workers claimed the same outbox job');
    const crashedJob = claims[0];
    const crashedRepository = claimOne.length === 1 ? repositoryOne : repositoryTwo;
    await crashedRepository.startSending(prepared.id, crashedJob.lockedBy);
    const recovered = await repositoryOne.recoverStaleOutboxJobs(new Date(Date.now() + 60_000));
    assert.equal(recovered, 1, 'Stale worker lease was not recovered');
    const [recoveredJob] = await repositoryTwo.claimOutboxJobs(`evidence-recovery-${suffix}`, 1);
    assert.equal(recoveredJob.id, crashedJob.id, 'Crash recovery changed outbox identity');
    await repositoryTwo.startSending(prepared.id, recoveredJob.lockedBy);
    await repositoryTwo.markManualReview({
      jobId: recoveredJob.id, workerId: recoveredJob.lockedBy, documentId: prepared.id,
      attemptNumber: recoveredJob.attemptCount, outcome: 'UNKNOWN_OUTCOME', requestSha256: prepared.payloadSha256,
      errorCode: 'EVIDENCE_CONTROLLED_STOP', startedAt: new Date(), finishedAt: new Date()
    });

    const highWater = await databaseOne.query(`select
      (select last_value::text from furs.invoice_number_sequence) as sequence_value,
      (select max(allocated_value)::text from furs.sequence_allocations) as maximum_allocated,
      (select count(*)::int from furs.schema_migrations) as migration_count`);
    const state = highWater.rows[0];
    assert.ok(BigInt(state.sequence_value) >= BigInt(state.maximum_allocated), 'Sequence high-water mark is below an allocation');
    return Object.freeze({
      evidenceVersion: 1, generatedAt: new Date().toISOString(), database: 'furs_evidence',
      concurrency: { uniqueAllocations: allocated.length, idempotentCallers: stable.length, idempotentSequences: 1 },
      outbox: { mutuallyExclusiveClaim: true, crashRecovered: true, preservedJobId: crashedJob.id === recoveredJob.id },
      sequence: { highWaterSafe: true }, migrations: { digestTracked: true, count: state.migration_count },
      evidenceEntityId: entityId, documentId: prepared.id
    });
  } finally {
    await Promise.all([poolOne.end(), poolTwo.end()]);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const passwordFile = process.env.DATABASE_PASSWORD_FILE;
  if (!connectionString || !passwordFile) throw new PostgresEvidenceError('FURS_PG_EVIDENCE_CONFIG', 'DATABASE_URL and DATABASE_PASSWORD_FILE are required');
  const password = (await readFile(passwordFile, 'utf8')).replace(/\r?\n$/, '');
  const evidence = await runPostgresEvidence({
    connectionString, password, confirmation: process.env.FURS_EVIDENCE_DATABASE_CONFIRMATION
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof PostgresEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_PG_EVIDENCE_FAILURE', message: 'PostgreSQL evidence run failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
