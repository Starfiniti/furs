import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';
import {
  BusinessPremiseId,
  ElectronicDeviceId,
  FiscalInvoiceIdentity,
  IdempotencyKey,
  InvoiceSequence,
  MessageId,
  PinnedOfficialSchemaValidator,
  PreparedBusinessPremiseCommand,
  PreparedFiscalCommand,
  ValidatedFursPayload,
  Zoi
} from '@starfiniti/furs-core';

import { PostgresFiscalRepository, runMigrations } from '../dist/index.js';

const entityId = '019ff57a-f30d-7290-9bb9-951bed760101';
const premiseRecordId = '019ff57a-f30d-7290-9bb9-951bed760102';
const deviceRecordId = '019ff57a-f30d-7290-9bb9-951bed760103';
const schemaBytes = Buffer.from(JSON.stringify({ type: 'object', required: ['InvoiceRequest'] }));
const validator = PinnedOfficialSchemaValidator.fromUtf8Bytes(
  schemaBytes,
  createHash('sha256').update(schemaBytes).digest('hex')
);

function adapter(db) {
  const query = (client, sql, params) =>
    params === undefined && /;\s*\S/s.test(sql)
      ? client.exec(sql).then(() => ({ rows: [] }))
      : client.query(sql, params ?? []);

  return {
    query: (sql, params) => query(db, sql, params),
    transaction: (work) =>
      db.transaction(async (tx) => work({ query: (sql, params) => query(tx, sql, params) }))
  };
}

async function setup(repositoryOptions = {}) {
  const db = new PGlite();
  const database = adapter(db);
  await runMigrations(database);
  const repository = new PostgresFiscalRepository(database, repositoryOptions);
  await repository.createLegalEntity({ id: entityId, taxNumber: '12345678', legalName: 'Starfiniti test' });
  await repository.upsertBusinessPremise({
    id: premiseRecordId,
    legalEntityId: entityId,
    businessPremiseId: 'TRGOVINA1',
    lifecycleStatus: 'REGISTERED',
    locationSnapshot: { PremiseType: 'C' },
    validityDate: '2026-08-12'
  });
  await repository.upsertElectronicDevice({
    id: deviceRecordId,
    legalEntityId: entityId,
    businessPremiseRecordId: premiseRecordId,
    electronicDeviceId: 'BLAG1'
  });
  return { db, database, repository };
}

function payload(marker = 'one') {
  return ValidatedFursPayload.fromJson(`{"InvoiceRequest":{"marker":"${marker}"}}`, validator);
}

function premisePayload(marker = 'one') {
  return ValidatedFursPayload.fromJson(`{"InvoiceRequest":{},"BusinessPremiseRequest":{"marker":"${marker}"}}`, validator);
}

function premiseCommand(overrides = {}) {
  return PreparedBusinessPremiseCommand.create({
    operationId: '019ff57a-f30d-7290-9bb9-951bed760150',
    legalEntityId: entityId,
    idempotencyKey: IdempotencyKey.parse('premise:postgres:1'),
    businessPremiseId: BusinessPremiseId.parse('TRGOVINA1'),
    requestedStatus: 'REGISTERED',
    messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4f'),
    payload: premisePayload(),
    sentAt: '2026-08-12T12:34:56',
    ...overrides
  });
}

function command(sequence, overrides = {}) {
  return PreparedFiscalCommand.create({
    operationId: '019ff57a-f30d-7290-9bb9-951bed760110',
    legalEntityId: entityId,
    idempotencyKey: IdempotencyKey.parse('order:postgres:1'),
    kind: 'STANDARD',
    identity: new FiscalInvoiceIdentity(
      BusinessPremiseId.parse('TRGOVINA1'),
      ElectronicDeviceId.parse('BLAG1'),
      InvoiceSequence.parse(sequence)
    ),
    messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4c'),
    payload: payload(),
    zoi: Zoi.parse('1da0adb4cc87fd85f909e0acb99a2aa4'),
    issueDateTime: '2026-08-12T12:34:56',
    ...overrides
  });
}

test('FURS-ID-002: PostgreSQL sequence allocations are unique and rollback values are burned', async (t) => {
  const { db, database, repository } = await setup();
  t.after(() => db.close());

  const allocations = await Promise.all(
    Array.from({ length: 128 }, () =>
      repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1')
    )
  );
  assert.equal(new Set(allocations).size, 128);
  assert.deepEqual(
    allocations.map(BigInt).sort((a, b) => (a < b ? -1 : 1)),
    Array.from({ length: 128 }, (_, index) => BigInt(index + 1))
  );

  let burned;
  await assert.rejects(
    database.transaction(async (tx) => {
      const result = await tx.query(
        'select furs.allocate_invoice_sequence($1::uuid,$2,$3)::text as value',
        [entityId, 'TRGOVINA1', 'BLAG1']
      );
      burned = result.rows[0].value;
      throw new Error('force rollback');
    }),
    /force rollback/
  );
  const afterRollback = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  assert.equal(BigInt(afterRollback), BigInt(burned) + 1n);
});

test('FURS-AUD-001: applied database migrations are digest-tracked and replay-safe', async (t) => {
  const { db, database } = await setup();
  t.after(() => db.close());
  await runMigrations(database);
  const migrations = await db.query('select name, sha256 from furs.schema_migrations order by name');
  assert.equal(migrations.rows.length, 14);
  assert.ok(migrations.rows.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)));
});

test('FURS-CERT-001/AUD-001: certificate activation is singular, replay-safe and audited', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const first = {
    id: '019ff57a-f30d-7290-9bb9-951bed760170', legalEntityId: entityId, environment: 'TEST',
    fingerprint256: Array(32).fill('aa').join(':'), subjectName: 'CN=FURS Test One',
    issuerName: 'CN=FURS Test CA', serialNumberDecimal: '101',
    validFrom: new Date('2026-01-01T00:00:00Z'), validTo: new Date('2027-01-01T00:00:00Z')
  };
  assert.equal(await repository.activateCertificateProfile(first), first.id);
  assert.equal(await repository.activateCertificateProfile({ ...first, id: '019ff57a-f30d-7290-9bb9-951bed760171' }), first.id);

  const replacement = {
    ...first, id: '019ff57a-f30d-7290-9bb9-951bed760172',
    fingerprint256: Array(32).fill('bb').join(':'), serialNumberDecimal: '102',
    subjectName: 'CN=FURS Test Two', validTo: new Date('2028-01-01T00:00:00Z')
  };
  assert.equal(await repository.activateCertificateProfile(replacement), replacement.id);
  const profiles = await db.query(
    'select id, active, fingerprint_sha256 from furs.certificate_profiles order by created_at, id'
  );
  assert.deepEqual(profiles.rows, [
    { id: first.id, active: false, fingerprint_sha256: first.fingerprint256.toUpperCase() },
    { id: replacement.id, active: true, fingerprint_sha256: replacement.fingerprint256.toUpperCase() }
  ]);
  const audits = await db.query(
    `select correlation_id, evidence from furs.audit_events
     where event_type = 'CERTIFICATE_PROFILE_ACTIVATED' order by id`
  );
  assert.equal(audits.rows.length, 2);
  assert.equal(JSON.stringify(audits.rows).includes(first.fingerprint256.toUpperCase()), false);
  assert.equal(audits.rows[1].evidence.fingerprintSuffix, 'BBBBBBBBBBBB');
});

test('FURS-SRC-001/AUD-001: reviewed source versions are append-only and placeholder reviewers fail', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const reviewed = [{
    sourceId: 'furs-tech-spec-3-2', sha256: 'a'.repeat(64),
    reviewedBy: 'Dejan Kletečki', reviewedAt: '2026-08-12'
  }];
  await repository.recordComplianceSourceVersions(reviewed);
  await repository.recordComplianceSourceVersions(reviewed);
  const rows = await db.query(
    'select source_id, sha256, reviewed_by, reviewed_at::text from furs.compliance_source_versions'
  );
  assert.deepEqual(rows.rows, [{
    source_id: reviewed[0].sourceId, sha256: reviewed[0].sha256,
    reviewed_by: reviewed[0].reviewedBy, reviewed_at: reviewed[0].reviewedAt
  }]);
  await assert.rejects(
    repository.recordComplianceSourceVersions([{ ...reviewed[0], sourceId: 'spot-guidance', reviewedBy: 'replace-with-reviewer' }]),
    (error) => error.code === 'FURS_SOURCE_MANIFEST'
  );
  await assert.rejects(db.query(
    'update furs.compliance_source_versions set reviewed_by = $1 where source_id = $2',
    ['Somebody else', reviewed[0].sourceId]
  ));
  await assert.rejects(db.query(
    'delete from furs.compliance_source_versions where source_id = $1', [reviewed[0].sourceId]
  ));
});

test('FURS-IDEMP-001: sequence reservation is stable across concurrent retries', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const values = await Promise.all(
    Array.from({ length: 32 }, () =>
      repository.reserveInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1', 'order:stable:42')
    )
  );
  assert.equal(new Set(values).size, 1);
});

test('FURS-DEV-001/PREM-001: a failed device blocks new identities but not idempotent replay', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const original = await repository.reserveInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1', 'order:before-failure');
  await repository.upsertElectronicDevice({
    id: deviceRecordId, legalEntityId: entityId, businessPremiseRecordId: premiseRecordId,
    electronicDeviceId: 'BLAG1', operational: false
  });
  assert.equal(
    await repository.reserveInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1', 'order:before-failure'),
    original
  );
  await assert.rejects(
    repository.reserveInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1', 'order:after-failure'),
    (error) => error.code === 'FURS_DEVICE_FALLBACK_REQUIRED'
  );
});

test('FURS-IDEMP-001/AUD-001: command, idempotency, outbox and audit are one transaction', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = command(sequence);

  const first = await repository.prepareFiscalCommand(prepared);
  const replay = await repository.prepareFiscalCommand(prepared);
  assert.equal(first.id, prepared.operationId);
  assert.equal(replay.id, first.id);
  assert.equal(replay.invoiceSequence, sequence);
  assert.equal(replay.payloadSha256, first.payloadSha256);

  const counts = await db.query(`select
    (select count(*)::int from furs.fiscal_documents) as documents,
    (select count(*)::int from furs.idempotency_ledger) as idempotency,
    (select count(*)::int from furs.outbox_jobs) as jobs,
    (select count(*)::int from furs.audit_events) as audits`);
  assert.deepEqual(counts.rows[0], { documents: 1, idempotency: 1, jobs: 1, audits: 1 });

  const conflicting = command(sequence, {
    operationId: '019ff57a-f30d-7290-9bb9-951bed760111',
    payload: payload('different')
  });
  await assert.rejects(
    repository.prepareFiscalCommand(conflicting),
    (error) => error.code === 'FURS_IDEMPOTENCY_CONFLICT'
  );
});

test('FURS-OUT-001: outbox claim, retry and confirmation preserve the original document', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = await repository.prepareFiscalCommand(command(sequence));

  const [firstJob] = await repository.claimOutboxJobs('worker-1');
  assert.equal(firstJob.documentId, prepared.id);
  assert.equal(firstJob.attemptCount, 1);
  assert.deepEqual(await repository.claimOutboxJobs('worker-2'), []);
  await repository.startSending(prepared.id, 'worker-1');
  await repository.scheduleRetry(
    {
      jobId: firstJob.id,
      workerId: 'worker-1',
      documentId: prepared.id,
      attemptNumber: 1,
      outcome: 'RETRYABLE_FAILURE',
      requestSha256: prepared.payloadSha256,
      errorCode: 'CONNECTION_TEMPORARY',
      startedAt: new Date('2026-08-12T10:00:00Z'),
      finishedAt: new Date('2026-08-12T10:00:01Z')
    },
    new Date('2000-01-01T00:00:00Z')
  );

  const [retryJob] = await repository.claimOutboxJobs('worker-2');
  assert.equal(retryJob.id, firstJob.id);
  assert.equal(retryJob.attemptCount, 2);
  await repository.startSending(prepared.id, 'worker-2');
  const fingerprint = Array(32).fill('AA').join(':');
  await repository.confirm(
    {
      jobId: retryJob.id,
      workerId: 'worker-2',
      documentId: prepared.id,
      attemptNumber: 2,
      outcome: 'CONFIRMED',
      requestSha256: prepared.payloadSha256,
      responseSha256: 'c'.repeat(64),
      certificateFingerprint256: fingerprint,
      startedAt: new Date('2026-08-12T10:01:00Z'),
      finishedAt: new Date('2026-08-12T10:01:01Z')
    },
    'b5f1c310-3dea-4331-82f8-d2dc72d9d018',
    fingerprint
  );

  const confirmed = await repository.getFiscalDocument(prepared.id);
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.eor, 'b5f1c310-3dea-4331-82f8-d2dc72d9d018');
  assert.equal(confirmed.invoiceSequence, sequence);
  assert.equal(confirmed.payloadJson, prepared.payloadJson);
  assert.equal((await db.query('select count(*)::int as count from furs.fiscal_attempts')).rows[0].count, 2);
  assert.equal((await db.query('select count(*)::int as count from furs.audit_events')).rows[0].count, 3);
});

test('FURS-ID-002/OUT-001/REL-001: bounded claim capacity exceeds the former 100-job ceiling', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());

  for (let index = 0; index < 101; index += 1) {
    const suffix = String(index + 200).padStart(12, '0');
    const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
    await repository.prepareFiscalCommand(command(sequence, {
      operationId: `019ff57a-f30d-7290-9bb9-${suffix}`,
      idempotencyKey: IdempotencyKey.parse(`claim-capacity:${index}`),
      messageId: MessageId.parse(`4e64a93a-40fa-4c02-afb1-${suffix}`),
      payload: payload(`claim-${index}`)
    }));
  }

  const jobs = await repository.claimOutboxJobs('worker-capacity', 250);
  assert.equal(jobs.length, 101);
  await assert.rejects(
    repository.claimOutboxJobs('worker-capacity', 251),
    (error) => error.code === 'FURS_OUTBOX_CLAIM'
  );
});

test('FURS-IDEMP-001/OUT-001: reconciliation cannot create a second active fiscal delivery', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = await repository.prepareFiscalCommand(command(sequence));
  const [job] = await repository.claimOutboxJobs('worker-reconcile');
  await repository.startSending(prepared.id, 'worker-reconcile');
  await repository.scheduleRetry({
    jobId: job.id, workerId: 'worker-reconcile', documentId: prepared.id, attemptNumber: 1,
    outcome: 'RETRYABLE_FAILURE', requestSha256: prepared.payloadSha256,
    errorCode: 'CONNECTION_TEMPORARY', startedAt: new Date('2026-08-12T10:00:00Z'),
    finishedAt: new Date('2026-08-12T10:00:01Z')
  }, new Date('2026-08-12T10:10:00Z'));

  assert.equal(await repository.enqueueReconciliation('4e64a93a-40fa-4c02-afb1-488534b85e51', entityId), 1);
  await repository.requestRetry(prepared.id, '4e64a93a-40fa-4c02-afb1-488534b85e52', entityId);
  const active = await db.query(
    `select job_type, status, count(*)::int as count from furs.outbox_jobs
     where document_id = $1 and job_type in ('SUBMIT','RECONCILE')
       and status in ('PENDING','PROCESSING','RETRY') group by job_type, status`, [prepared.id]
  );
  assert.deepEqual(active.rows, [{ job_type: 'SUBMIT', status: 'RETRY', count: 1 }]);
});

test('FURS-AUD-001/OUT-001: operator retry continues the immutable attempt sequence', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = await repository.prepareFiscalCommand(command(sequence));
  const [firstJob] = await repository.claimOutboxJobs('worker-first');
  await repository.startSending(prepared.id, 'worker-first');
  await repository.markManualReview({
    jobId: firstJob.id, workerId: 'worker-first', documentId: prepared.id, attemptNumber: 1,
    outcome: 'UNKNOWN_OUTCOME', requestSha256: prepared.payloadSha256, errorCode: 'TEST_FAILURE',
    startedAt: new Date('2026-08-12T10:00:00Z'), finishedAt: new Date('2026-08-12T10:00:01Z')
  });

  await repository.requestRetry(prepared.id, '4e64a93a-40fa-4c02-afb1-488534b85e53', entityId);
  const [retryJob] = await repository.claimOutboxJobs('worker-retry');
  assert.equal(retryJob.attemptCount, 2);
});

test('FURS-COR-001/AUD-001: fiscal evidence is append-only and confirmed data is immutable', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = await repository.prepareFiscalCommand(command(sequence));
  const [job] = await repository.claimOutboxJobs('worker-1');
  await repository.startSending(prepared.id, 'worker-1');
  const fingerprint = Array(32).fill('AA').join(':');
  await repository.confirm(
    {
      jobId: job.id,
      workerId: 'worker-1',
      documentId: prepared.id,
      attemptNumber: 1,
      outcome: 'CONFIRMED',
      requestSha256: prepared.payloadSha256,
      responseSha256: 'd'.repeat(64),
      certificateFingerprint256: fingerprint,
      startedAt: new Date('2026-08-12T10:00:00Z'),
      finishedAt: new Date('2026-08-12T10:00:01Z')
    },
    'b5f1c310-3dea-4331-82f8-d2dc72d9d018',
    fingerprint
  );

  await assert.rejects(db.query("update furs.fiscal_documents set payload_json='{}' where id=$1", [prepared.id]));
  await assert.rejects(db.query("update furs.fiscal_documents set status='SENDING' where id=$1", [prepared.id]));
  await assert.rejects(db.query(
    'update furs.fiscal_documents set certificate_fingerprint_sha256=$2 where id=$1',
    [prepared.id, Array(32).fill('BB').join(':')]
  ));
  await assert.rejects(db.query(
    'update furs.fiscal_documents set confirmed_at=$2 where id=$1',
    [prepared.id, new Date('2026-08-12T11:00:00Z')]
  ));
  await assert.rejects(db.query('delete from furs.fiscal_documents where id=$1', [prepared.id]));
  await assert.rejects(db.query('delete from furs.fiscal_attempts where document_id=$1', [prepared.id]));
  await assert.rejects(db.query('update furs.audit_events set evidence=\'{}\'::jsonb where document_id=$1', [prepared.id]));

  const correctionSequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const correction = command(correctionSequence, {
    operationId: '019ff57a-f30d-7290-9bb9-951bed760112',
    idempotencyKey: IdempotencyKey.parse('order:postgres:correction:1'),
    kind: 'CORRECTION',
    correctionOfOperationId: prepared.id,
    messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e4d')
  });
  const storedCorrection = await repository.prepareFiscalCommand(correction);
  assert.equal(storedCorrection.correctionOfDocumentId, prepared.id);
  assert.notEqual(storedCorrection.invoiceSequence, prepared.invoiceSequence);
});

test('FURS-SEC-001/002: persistence schema contains metadata/hashes but no secret or raw-token columns', async (t) => {
  const { db } = await setup();
  t.after(() => db.close());
  const columns = await db.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'furs' order by table_name, ordinal_position`
  );
  const names = columns.rows.map((row) => `${row.table_name}.${row.column_name}`).join('\n');
  assert.doesNotMatch(names, /password|private_key|pkcs12|p12|raw_token|signed_token/i);
  assert.match(names, /certificate_profiles\.fingerprint_sha256/);
  assert.match(names, /fiscal_documents\.payload_sha256/);
});

test('FURS-PREM-001: premise command, outbox and confirmed lifecycle are atomic', async (t) => {
  const { db, database, repository } = await setup();
  t.after(() => db.close());
  const fingerprint = Array(32).fill('AA').join(':');
  const command = premiseCommand();
  const prepared = await repository.prepareBusinessPremiseCommand(
    command, { kind: 'movable', premiseType: 'C' }, '2026-08-12'
  );
  const replay = await repository.prepareBusinessPremiseCommand(
    command, { kind: 'movable', premiseType: 'C' }, '2026-08-12'
  );
  assert.equal(prepared.id, replay.id);
  assert.equal(prepared.operationClass, 'BUSINESS_PREMISE');
  const [job] = await repository.claimOutboxJobs('premise-worker');
  await repository.startSending(prepared.id, 'premise-worker');
  await repository.confirmBusinessPremise({
    jobId: job.id, workerId: 'premise-worker', documentId: prepared.id, attemptNumber: 1,
    outcome: 'CONFIRMED', requestSha256: prepared.payloadSha256,
    certificateFingerprint256: fingerprint,
    startedAt: new Date('2026-08-12T10:35:00Z'), finishedAt: new Date('2026-08-12T10:35:01Z')
  }, fingerprint);
  const state = await database.query(
    `select document.status, document.eor, premise.lifecycle_status
     from furs.fiscal_documents document
     join furs.business_premise_operations operation on operation.document_id = document.id
     join furs.business_premises premise on premise.id = operation.business_premise_record_id
     where document.id = $1`, [prepared.id]
  );
  assert.equal(state.rows[0].status, 'CONFIRMED');
  assert.equal(state.rows[0].eor, null);
  assert.equal(state.rows[0].lifecycle_status, 'REGISTERED');
});

test('FURS-PREM-001/IDEMP-001: overlapping premise lifecycle commands fail closed', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  await repository.prepareBusinessPremiseCommand(
    premiseCommand(), { kind: 'movable', premiseType: 'C' }, '2026-08-12'
  );
  await assert.rejects(
    repository.prepareBusinessPremiseCommand(
      premiseCommand({
        operationId: '019ff57a-f30d-7290-9bb9-951bed760151',
        idempotencyKey: IdempotencyKey.parse('premise:postgres:close'),
        requestedStatus: 'CLOSED',
        messageId: MessageId.parse('4e64a93a-40fa-4c02-afb1-488534b85e50'),
        payload: premisePayload('close')
      }),
      { kind: 'movable', premiseType: 'C' }, '2026-08-12'
    ),
    (error) => error.code === 'FURS_PREMISE_OPERATION_ACTIVE'
  );
  const counts = await db.query(`select
    (select count(*)::int from furs.fiscal_documents where operation_class='BUSINESS_PREMISE') as documents,
    (select count(*)::int from furs.outbox_jobs) as jobs`);
  assert.deepEqual(counts.rows[0], { documents: 1, jobs: 1 });
});

test('FURS-AUD-001: terminal confirmation atomically queues a redacted durable webhook', async (t) => {
  const { db, repository } = await setup({ webhookDestinationId: 'primary' });
  t.after(() => db.close());
  const sequence = await repository.allocateInvoiceSequence(entityId, 'TRGOVINA1', 'BLAG1');
  const prepared = await repository.prepareFiscalCommand(command(sequence));
  const [submitJob] = await repository.claimOutboxJobs('submit-worker');
  await repository.startSending(prepared.id, 'submit-worker');
  const fingerprint = Array(32).fill('AA').join(':');
  await repository.confirm({
    jobId: submitJob.id, workerId: 'submit-worker', documentId: prepared.id, attemptNumber: 1,
    outcome: 'CONFIRMED', requestSha256: prepared.payloadSha256, responseSha256: 'e'.repeat(64),
    certificateFingerprint256: fingerprint,
    startedAt: new Date('2026-08-12T10:35:00Z'), finishedAt: new Date('2026-08-12T10:35:01Z')
  }, 'b5f1c310-3dea-4331-82f8-d2dc72d9d018', fingerprint);

  const [webhookJob] = await repository.claimOutboxJobs('webhook-worker');
  assert.equal(webhookJob.jobType, 'WEBHOOK');
  const delivery = await repository.getPendingWebhookDelivery(prepared.id);
  assert.ok(delivery);
  assert.equal(delivery.destinationId, 'primary');
  assert.equal(createHash('sha256').update(delivery.payloadJson).digest('hex'), delivery.payloadSha256);
  const webhookBody = JSON.parse(delivery.payloadJson);
  assert.equal(webhookBody.document.status, 'CONFIRMED');
  assert.equal('payloadJson' in webhookBody.document, false);
  assert.equal('certificateFingerprint256' in webhookBody.document, false);
  await repository.completeWebhook(webhookJob, delivery, new Date('2026-08-12T10:35:02Z'));
  const stored = await db.query('select status, attempt_count from furs.webhook_deliveries where id = $1', [delivery.id]);
  assert.deepEqual(stored.rows[0], { status: 'DELIVERED', attempt_count: 1 });
});

test('FURS-AUD-001: worker heartbeat is observable without fiscal payload data', async (t) => {
  const { db, repository } = await setup();
  t.after(() => db.close());
  await repository.heartbeatWorker('worker-observable', new Date('2026-08-12T10:35:02Z'));
  await repository.heartbeatWorker('worker-observable', new Date('2026-08-12T10:35:12Z'));
  const summary = await repository.getOperationalSummary(entityId);
  assert.equal(summary.workerLastSeenAt, '2026-08-12T10:35:12.000Z');
});
