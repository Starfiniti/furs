#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPostgresPool, MIGRATION_FILES, readMigration } from '../packages/persistence-postgres/dist/index.js';

class RestoreEvidenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function evaluateRestoreIntegrity(snapshot) {
  const failures = [];
  const numeric = (name) => {
    const value = Number(snapshot[name]);
    if (!Number.isSafeInteger(value) || value < 0) throw new RestoreEvidenceError('FURS_RESTORE_RESULT', `Invalid restore metric ${name}`);
    return value;
  };
  const sequenceValue = BigInt(snapshot.sequenceValue);
  const maximumAllocated = snapshot.maximumAllocated === null ? 0n : BigInt(snapshot.maximumAllocated);
  if (sequenceValue < maximumAllocated) failures.push('SEQUENCE_BELOW_ALLOCATED_HIGH_WATER');
  for (const name of [
    'orphanIdempotency', 'duplicateFiscalIdentity', 'confirmedInvoiceWithoutEor',
    'activeDocumentWithoutOutbox', 'documentWithoutAudit', 'payloadHashMismatch',
    'migrationDigestInvalid'
  ]) {
    if (numeric(name) !== 0) failures.push(name.replaceAll(/[a-z][A-Z]/g, (pair) => `${pair[0]}_${pair[1]}`).toUpperCase());
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

async function collectSnapshot(client) {
  const result = await client.query(`select
    (select last_value::text from furs.invoice_number_sequence) as "sequenceValue",
    (select max(allocated_value)::text from furs.sequence_allocations) as "maximumAllocated",
    (select count(*)::text from furs.idempotency_ledger ledger left join furs.fiscal_documents document on document.id = ledger.document_id where document.id is null) as "orphanIdempotency",
    (select count(*)::text from (select legal_entity_id, business_premise_code, electronic_device_code, invoice_sequence from furs.fiscal_documents where operation_class = 'FISCAL_INVOICE' group by 1,2,3,4 having count(*) > 1) duplicates) as "duplicateFiscalIdentity",
    (select count(*)::text from furs.fiscal_documents where operation_class = 'FISCAL_INVOICE' and status in ('CONFIRMED','REVERSED') and eor is null) as "confirmedInvoiceWithoutEor",
    (select count(*)::text from furs.fiscal_documents document where document.status in ('READY','SENDING','ISSUED_WITHOUT_EOR','RETRY_PENDING') and not exists (select 1 from furs.outbox_jobs job where job.document_id = document.id and job.status in ('PENDING','PROCESSING','RETRY'))) as "activeDocumentWithoutOutbox",
    (select count(*)::text from furs.fiscal_documents document where not exists (select 1 from furs.audit_events audit where audit.document_id = document.id)) as "documentWithoutAudit",
    (select count(*)::text from furs.fiscal_documents) as "documentCount",
    (select count(*)::text from furs.fiscal_attempts) as "attemptCount",
    (select count(*)::text from furs.audit_events) as "auditCount"`);
  const snapshot = result.rows[0];
  if (snapshot === undefined) throw new RestoreEvidenceError('FURS_RESTORE_QUERY', 'Restore integrity query returned no row');
  const appliedMigrations = await client.query('select name, sha256 from furs.schema_migrations');
  const expectedMigrations = new Map(await Promise.all(MIGRATION_FILES.map(async (name) => [
    name, createHash('sha256').update(await readMigration(name), 'utf8').digest('hex')
  ])));
  let migrationDigestInvalid = Math.abs(appliedMigrations.rows.length - expectedMigrations.size);
  for (const row of appliedMigrations.rows) {
    if (expectedMigrations.get(row.name) !== row.sha256) migrationDigestInvalid += 1;
  }
  let payloadHashMismatch = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const page = await client.query(
      `select id, payload_json, payload_sha256 from furs.fiscal_documents
       where id > $1::uuid order by id limit 1000`, [lastId]
    );
    if (page.rows.length === 0) break;
    for (const row of page.rows) {
      if (createHash('sha256').update(row.payload_json, 'utf8').digest('hex') !== row.payload_sha256) payloadHashMismatch += 1;
    }
    lastId = page.rows.at(-1).id;
  }
  return { ...snapshot, payloadHashMismatch, migrationDigestInvalid };
}

export async function verifyRestoredDatabase(options) {
  if (options.confirmation !== 'read-only-restore-verification') {
    throw new RestoreEvidenceError('FURS_RESTORE_GUARD', 'Restore verification confirmation is missing');
  }
  const pool = createPostgresPool({ connectionString: options.connectionString, password: options.password, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');
    await client.query("set local statement_timeout = '10min'");
    const snapshot = await collectSnapshot(client);
    const decision = evaluateRestoreIntegrity(snapshot);
    if (!decision.ok) throw new RestoreEvidenceError('FURS_RESTORE_INTEGRITY', `Restore integrity failed: ${decision.failures.join(',')}`);
    await client.query('commit');
    const counts = {
      documents: Number(snapshot.documentCount), attempts: Number(snapshot.attemptCount), audits: Number(snapshot.auditCount)
    };
    return Object.freeze({
      evidenceVersion: 1, generatedAt: new Date().toISOString(), readOnlyTransaction: true,
      sequenceHighWaterSafe: true, payloadHashesVerified: true, referentialChecksPassed: true,
      counts, countsSha256: createHash('sha256').update(JSON.stringify(counts)).digest('hex')
    });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const passwordFile = process.env.DATABASE_PASSWORD_FILE;
  if (!connectionString || !passwordFile) throw new RestoreEvidenceError('FURS_RESTORE_CONFIG', 'DATABASE_URL and DATABASE_PASSWORD_FILE are required');
  const password = (await readFile(passwordFile, 'utf8')).replace(/\r?\n$/, '');
  const evidence = await verifyRestoredDatabase({
    connectionString, password, confirmation: process.env.FURS_RESTORE_CONFIRMATION
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const safe = error instanceof RestoreEvidenceError
      ? { code: error.code, message: error.message }
      : { code: 'FURS_RESTORE_FAILURE', message: 'Restore verification failed' };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
