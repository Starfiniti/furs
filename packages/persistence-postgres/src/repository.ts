import { createHash, randomUUID } from 'node:crypto';

import {
  FursDomainError,
  type FiscalDocumentStatus,
  type PreparedBusinessPremiseCommand,
  type PreparedFiscalCommand
} from '@starfiniti/furs-core';
import type { QueryResultRow } from 'pg';

import type { SqlClient, TransactionalDatabase } from './database.js';

interface DocumentRow extends QueryResultRow {
  id: string;
  legal_entity_id: string;
  operation_class: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE';
  document_kind: 'STANDARD' | 'CORRECTION' | 'CANCELLATION' | 'PREMISE';
  correction_of_document_id: string | null;
  idempotency_key: string;
  request_sha256: string;
  status: FiscalDocumentStatus;
  business_premise_code: string;
  electronic_device_code: string | null;
  invoice_sequence: string | null;
  issue_local_time: string;
  message_id: string;
  schema_sha256: string;
  payload_json: string;
  payload_sha256: string;
  zoi: string | null;
  eor: string | null;
  certificate_fingerprint_sha256: string | null;
  confirmed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  subsequent_submit: boolean;
}

export interface StoredFiscalDocument {
  readonly id: string;
  readonly legalEntityId: string;
  readonly operationClass: 'FISCAL_INVOICE' | 'BUSINESS_PREMISE';
  readonly kind: 'STANDARD' | 'CORRECTION' | 'CANCELLATION' | 'PREMISE';
  readonly correctionOfDocumentId: string | undefined;
  readonly idempotencyKey: string;
  readonly requestSha256: string;
  readonly status: FiscalDocumentStatus;
  readonly businessPremiseId: string;
  readonly electronicDeviceId: string | undefined;
  readonly invoiceSequence: string | undefined;
  readonly issueLocalTime: string;
  readonly messageId: string;
  readonly schemaSha256: string;
  readonly payloadJson: string;
  readonly payloadSha256: string;
  readonly zoi: string | undefined;
  readonly eor: string | undefined;
  readonly certificateFingerprint256: string | undefined;
  readonly confirmedAt: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly subsequentSubmit: boolean;
}

export interface ConfirmedInvoiceReference {
  readonly documentId: string;
  readonly businessPremiseId: string;
  readonly electronicDeviceId: string;
  readonly invoiceSequence: string;
  readonly issueLocalTime: string;
}

export interface OperationalSummary {
  readonly documentsByStatus: Readonly<Record<string, number>>;
  readonly activeOutboxJobs: number;
  readonly oldestActiveOutboxAt: string | undefined;
  readonly oldestUnconfirmedAt: string | undefined;
  readonly workerLastSeenAt: string | undefined;
}

function instant(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new FursDomainError('FURS_DB_TIMESTAMP', 'Database returned an invalid timestamp');
  }
  return parsed.toISOString();
}

function mapDocument(row: DocumentRow): StoredFiscalDocument {
  return Object.freeze({
    id: row.id,
    legalEntityId: row.legal_entity_id,
    operationClass: row.operation_class,
    kind: row.document_kind,
    correctionOfDocumentId: row.correction_of_document_id ?? undefined,
    idempotencyKey: row.idempotency_key,
    requestSha256: row.request_sha256,
    status: row.status,
    businessPremiseId: row.business_premise_code,
    electronicDeviceId: row.electronic_device_code ?? undefined,
    invoiceSequence: row.invoice_sequence === null ? undefined : String(row.invoice_sequence),
    issueLocalTime: row.issue_local_time,
    messageId: row.message_id,
    schemaSha256: row.schema_sha256,
    payloadJson: row.payload_json,
    payloadSha256: row.payload_sha256,
    zoi: row.zoi ?? undefined,
    eor: row.eor ?? undefined,
    certificateFingerprint256: row.certificate_fingerprint_sha256 ?? undefined,
    confirmedAt: row.confirmed_at === null ? undefined : instant(row.confirmed_at),
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    subsequentSubmit: row.subsequent_submit
  });
}

export interface LegalEntityInput {
  readonly id?: string;
  readonly taxNumber: string;
  readonly legalName: string;
}

export interface CertificateProfileInput {
  readonly id?: string;
  readonly legalEntityId: string;
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly fingerprint256: string;
  readonly subjectName: string;
  readonly issuerName: string;
  readonly serialNumberDecimal: string;
  readonly validFrom: Date;
  readonly validTo: Date;
}

export interface ComplianceSourceVersionInput {
  readonly sourceId: string;
  readonly sha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

export interface BusinessPremiseRecordInput {
  readonly id?: string;
  readonly legalEntityId: string;
  readonly businessPremiseId: string;
  readonly lifecycleStatus: 'PENDING' | 'REGISTERED' | 'CLOSED' | 'REJECTED';
  readonly locationSnapshot: Readonly<Record<string, unknown>>;
  readonly validityDate: string;
  readonly closedAt?: Date;
}

export interface ElectronicDeviceRecordInput {
  readonly id?: string;
  readonly legalEntityId: string;
  readonly businessPremiseRecordId: string;
  readonly electronicDeviceId: string;
  readonly operational?: boolean;
}

export interface ElectronicDeviceConfigurationInput {
  readonly legalEntityId: string;
  readonly businessPremiseId: string;
  readonly electronicDeviceId: string;
  readonly operational: boolean;
  readonly correlationId: string;
}

export interface ClaimedOutboxJob {
  readonly id: string;
  readonly documentId: string;
  readonly jobType: 'SUBMIT' | 'RECONCILE' | 'WEBHOOK';
  readonly attemptCount: number;
  readonly lockedBy: string;
  readonly lockedAt: string;
}

interface OutboxRow extends QueryResultRow {
  id: string;
  document_id: string;
  job_type: ClaimedOutboxJob['jobType'];
  attempt_count: number;
  locked_by: string;
  locked_at: Date | string;
}

export interface PendingWebhookDelivery {
  readonly id: string;
  readonly documentId: string;
  readonly destinationId: string;
  readonly payloadJson: string;
  readonly payloadSha256: string;
}

interface WebhookRow extends QueryResultRow {
  id: string;
  document_id: string;
  destination_id: string;
  payload_json: string;
  payload_sha256: string;
}

export interface PostgresFiscalRepositoryOptions {
  readonly webhookDestinationId?: string;
}

export interface CompletedAttemptInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly documentId: string;
  readonly attemptNumber: number;
  readonly outcome: 'CONFIRMED' | 'REJECTED' | 'RETRYABLE_FAILURE' | 'UNKNOWN_OUTCOME' | 'SECURITY_FAILURE';
  readonly requestSha256: string;
  readonly responseSha256?: string;
  readonly certificateFingerprint256?: string;
  readonly errorCode?: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

export class PostgresFiscalRepository {
  readonly #database: TransactionalDatabase;
  readonly #webhookDestinationId: string | undefined;

  public constructor(database: TransactionalDatabase, options: PostgresFiscalRepositoryOptions = {}) {
    this.#database = database;
    if (options.webhookDestinationId !== undefined && !/^[A-Za-z0-9._:-]{1,200}$/.test(options.webhookDestinationId)) {
      throw new FursDomainError('FURS_WEBHOOK_DESTINATION', 'Webhook destination ID is invalid');
    }
    this.#webhookDestinationId = options.webhookDestinationId;
  }

  public async createLegalEntity(input: LegalEntityInput): Promise<string> {
    const id = input.id ?? randomUUID();
    await this.#database.query(
      `insert into furs.legal_entities (id, tax_number, legal_name)
       values ($1, $2, $3)
       on conflict (tax_number) do update set legal_name = excluded.legal_name`,
      [id, input.taxNumber, input.legalName]
    );
    const existing = await this.#database.query<{ id: string } & QueryResultRow>(
      'select id from furs.legal_entities where tax_number = $1',
      [input.taxNumber]
    );
    const row = existing.rows[0];
    if (row === undefined) throw new FursDomainError('FURS_DB_ENTITY', 'Legal entity was not persisted');
    return row.id;
  }

  /** Requirements: FURS-CERT-001, FURS-AUD-001. */
  public async activateCertificateProfile(input: CertificateProfileInput): Promise<string> {
    if (!/^(?:[a-f0-9]{2}:){31}[a-f0-9]{2}$/i.test(input.fingerprint256)) {
      throw new FursDomainError('FURS_CERTIFICATE_FINGERPRINT', 'Certificate fingerprint is invalid');
    }
    if (!/^\d+$/.test(input.serialNumberDecimal)) {
      throw new FursDomainError('FURS_CERTIFICATE_SERIAL', 'Certificate serial number is invalid');
    }
    if (
      input.subjectName.length < 1 || input.subjectName.length > 4096 ||
      input.issuerName.length < 1 || input.issuerName.length > 4096 ||
      !Number.isFinite(input.validFrom.getTime()) || !Number.isFinite(input.validTo.getTime()) ||
      input.validTo <= input.validFrom
    ) {
      throw new FursDomainError('FURS_CERTIFICATE_METADATA', 'Certificate metadata is invalid');
    }
    const id = input.id ?? randomUUID();
    const result = await this.#database.query<{ id: string } & QueryResultRow>(
      `select furs.activate_certificate_profile(
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text,
         $7::text, $8::timestamptz, $9::timestamptz
       ) as id`,
      [
        id, input.legalEntityId, input.environment, input.fingerprint256.toUpperCase(),
        input.subjectName, input.issuerName, input.serialNumberDecimal,
        input.validFrom, input.validTo
      ]
    );
    const activated = result.rows[0];
    if (activated === undefined) throw new FursDomainError('FURS_CERTIFICATE_PROFILE', 'Certificate profile was not activated');
    return activated.id;
  }

  /** Requirements: FURS-SRC-001, FURS-AUD-001. */
  public async recordComplianceSourceVersions(inputs: readonly ComplianceSourceVersionInput[]): Promise<void> {
    if (inputs.length < 1 || inputs.length > 100) {
      throw new FursDomainError('FURS_SOURCE_MANIFEST', 'Compliance source manifest must contain 1 to 100 sources');
    }
    const unique = new Set<string>();
    for (const input of inputs) {
      const parsedDate = new Date(`${input.reviewedAt}T00:00:00Z`);
      if (
        !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(input.sourceId) ||
        !/^[a-f0-9]{64}$/.test(input.sha256) ||
        input.reviewedBy.length < 2 || input.reviewedBy.length > 200 ||
        /^replace[- ]/i.test(input.reviewedBy) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.reviewedAt) ||
        !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.reviewedAt ||
        unique.has(input.sourceId)
      ) {
        throw new FursDomainError('FURS_SOURCE_MANIFEST', 'Compliance source manifest is invalid');
      }
      unique.add(input.sourceId);
    }
    await this.#database.transaction(async (client) => {
      for (const input of inputs) {
        await client.query(
          `insert into furs.compliance_source_versions (source_id, sha256, reviewed_by, reviewed_at)
           values ($1, $2, $3, $4::date)
           on conflict (source_id, sha256) do nothing`,
          [input.sourceId, input.sha256, input.reviewedBy, input.reviewedAt]
        );
      }
    });
  }

  public async upsertBusinessPremise(input: BusinessPremiseRecordInput): Promise<string> {
    const id = input.id ?? randomUUID();
    await this.#database.query(
      `insert into furs.business_premises (
         id, legal_entity_id, business_premise_id, lifecycle_status,
         location_snapshot, validity_date, closed_at
       ) values ($1, $2, $3, $4, $5::jsonb, $6::date, $7)
       on conflict (legal_entity_id, business_premise_id) do update
       set lifecycle_status = excluded.lifecycle_status,
           location_snapshot = excluded.location_snapshot,
           validity_date = excluded.validity_date,
           closed_at = excluded.closed_at,
           updated_at = clock_timestamp()`,
      [
        id,
        input.legalEntityId,
        input.businessPremiseId,
        input.lifecycleStatus,
        JSON.stringify(input.locationSnapshot),
        input.validityDate,
        input.closedAt ?? null
      ]
    );
    const result = await this.#database.query<{ id: string } & QueryResultRow>(
      `select id from furs.business_premises
       where legal_entity_id = $1 and business_premise_id = $2`,
      [input.legalEntityId, input.businessPremiseId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new FursDomainError('FURS_DB_PREMISE', 'Business premise was not persisted');
    return row.id;
  }

  public async upsertElectronicDevice(input: ElectronicDeviceRecordInput): Promise<string> {
    const id = input.id ?? randomUUID();
    await this.#database.query(
      `insert into furs.electronic_devices (
         id, legal_entity_id, business_premise_id, electronic_device_id, operational
       ) values ($1, $2, $3, $4, $5)
       on conflict (business_premise_id, electronic_device_id) do update
       set operational = excluded.operational, updated_at = clock_timestamp()`,
      [
        id,
        input.legalEntityId,
        input.businessPremiseRecordId,
        input.electronicDeviceId,
        input.operational ?? true
      ]
    );
    const result = await this.#database.query<{ id: string } & QueryResultRow>(
      `select id from furs.electronic_devices
       where business_premise_id = $1 and electronic_device_id = $2`,
      [input.businessPremiseRecordId, input.electronicDeviceId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new FursDomainError('FURS_DB_DEVICE', 'Electronic device was not persisted');
    return row.id;
  }

  public async configureElectronicDevice(input: ElectronicDeviceConfigurationInput): Promise<string> {
    return this.#database.transaction(async (client) => {
      const premise = await client.query<{ id: string } & QueryResultRow>(
        `select id from furs.business_premises
         where legal_entity_id = $1 and business_premise_id = $2 for key share`,
        [input.legalEntityId, input.businessPremiseId]
      );
      const premiseId = premise.rows[0]?.id;
      if (premiseId === undefined) throw new FursDomainError('FURS_DB_PREMISE', 'Configured business premise does not exist');
      const id = randomUUID();
      const device = await client.query<{ id: string } & QueryResultRow>(
        `insert into furs.electronic_devices (
           id, legal_entity_id, business_premise_id, electronic_device_id, operational
         ) values ($1, $2, $3, $4, $5)
         on conflict (business_premise_id, electronic_device_id) do update set
           operational = excluded.operational, updated_at = clock_timestamp()
         returning id`,
        [id, input.legalEntityId, premiseId, input.electronicDeviceId, input.operational]
      );
      const deviceId = device.rows[0]?.id;
      if (deviceId === undefined) throw new FursDomainError('FURS_DB_DEVICE', 'Electronic device was not configured');
      await appendAudit(client, {
        legalEntityId: input.legalEntityId,
        eventType: input.operational ? 'ELECTRONIC_DEVICE_ENABLED' : 'ELECTRONIC_DEVICE_DISABLED',
        actorType: 'OPERATOR',
        correlationId: input.correlationId,
        evidence: { businessPremiseId: input.businessPremiseId, electronicDeviceId: input.electronicDeviceId }
      });
      return deviceId;
    });
  }

  /** FURS-ID-002: nextval is non-transactional, so rolled-back values are burned, never reused. */
  public async allocateInvoiceSequence(
    legalEntityId: string,
    businessPremiseId: string,
    electronicDeviceId: string
  ): Promise<string> {
    const result = await this.#database.query<{ allocated: string } & QueryResultRow>(
      'select furs.allocate_invoice_sequence($1::uuid, $2::text, $3::text)::text as allocated',
      [legalEntityId, businessPremiseId, electronicDeviceId]
    );
    const allocated = result.rows[0]?.allocated;
    if (allocated === undefined || !/^[1-9]\d*$/.test(allocated)) {
      throw new FursDomainError('FURS_DB_SEQUENCE', 'Database did not allocate an invoice sequence');
    }
    return allocated;
  }

  /** FURS-ID-002/IDEMP-001: one stable reservation per caller idempotency key. */
  public async reserveInvoiceSequence(
    legalEntityId: string,
    businessPremiseId: string,
    electronicDeviceId: string,
    idempotencyKey: string
  ): Promise<string> {
    let result;
    try {
      result = await this.#database.query<{ allocated: string } & QueryResultRow>(
        `select furs.reserve_invoice_sequence($1::uuid, $2::text, $3::text, $4::text)::text as allocated`,
        [legalEntityId, businessPremiseId, electronicDeviceId, idempotencyKey]
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('FURS_DEVICE_OR_PREMISE_NOT_OPERATIONAL')) {
        throw new FursDomainError(
          'FURS_DEVICE_FALLBACK_REQUIRED',
          'Business premise or issuing device is not operational; follow the approved operator/VKR procedure'
        );
      }
      throw error;
    }
    const allocated = result.rows[0]?.allocated;
    if (allocated === undefined || !/^[1-9]\d*$/.test(allocated)) {
      throw new FursDomainError('FURS_DB_SEQUENCE', 'Database did not reserve an invoice sequence');
    }
    return allocated;
  }

  public async assertLegalEntityTaxNumber(legalEntityId: string, taxNumber: string): Promise<void> {
    const result = await this.#database.query(
      'select 1 from furs.legal_entities where id = $1 and tax_number = $2 and active',
      [legalEntityId, taxNumber]
    );
    if (result.rows.length !== 1) {
      throw new FursDomainError('FURS_LEGAL_ENTITY_MISMATCH', 'Fiscal command does not match the configured legal entity');
    }
  }

  public async requestRetry(documentId: string, actorCorrelationId: string, legalEntityId?: string): Promise<void> {
    await this.#database.transaction(async (client) => {
      const result = await client.query<DocumentRow>(
        `select * from furs.fiscal_documents
         where id = $1 and ($2::uuid is null or legal_entity_id = $2)
           and status in ('RETRY_PENDING','ISSUED_WITHOUT_EOR','MANUAL_REVIEW')
         for update`,
        [documentId, legalEntityId ?? null]
      );
      const document = result.rows[0];
      if (document === undefined) {
        throw new FursDomainError('FURS_RETRY_STATE', 'Document is not eligible for an operator-requested retry');
      }
      await client.query(
        `insert into furs.outbox_jobs (document_id, job_type, status, available_at)
         values ($1, 'SUBMIT', 'PENDING', clock_timestamp())
         on conflict (document_id) where job_type in ('SUBMIT','RECONCILE') and status in ('PENDING','PROCESSING','RETRY')
         do update set available_at = least(furs.outbox_jobs.available_at, excluded.available_at)`,
        [documentId]
      );
      await appendAudit(client, {
        documentId,
        legalEntityId: document.legal_entity_id,
        eventType: 'FISCAL_RETRY_REQUESTED',
        actorType: 'OPERATOR',
        correlationId: actorCorrelationId,
        evidence: { status: document.status }
      });
    });
  }

  public async enqueueReconciliation(correlationId: string, legalEntityId?: string): Promise<number> {
    return this.#database.transaction(async (client) => {
      const documents = await client.query<DocumentRow>(
        `select * from furs.fiscal_documents
         where ($1::uuid is null or legal_entity_id = $1)
           and status in ('ISSUED_WITHOUT_EOR','RETRY_PENDING','MANUAL_REVIEW')
         order by created_at for update`
        , [legalEntityId ?? null]
      );
      for (const document of documents.rows) {
        await client.query(
          `insert into furs.outbox_jobs (document_id, job_type, status, available_at)
           values ($1, 'RECONCILE', 'PENDING', clock_timestamp())
           on conflict (document_id) where job_type in ('SUBMIT','RECONCILE') and status in ('PENDING','PROCESSING','RETRY')
           do nothing`,
          [document.id]
        );
        await appendAudit(client, {
          documentId: document.id,
          legalEntityId: document.legal_entity_id,
          eventType: 'FISCAL_RECONCILIATION_REQUESTED',
          actorType: 'OPERATOR',
          correlationId,
          evidence: { status: document.status }
        });
      }
      return documents.rows.length;
    });
  }

  public async ping(): Promise<void> {
    await this.#database.query('select 1');
  }

  public async listFiscalDocuments(
    status: FiscalDocumentStatus | undefined,
    limit = 100,
    legalEntityId?: string
  ): Promise<readonly StoredFiscalDocument[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new FursDomainError('FURS_DB_LIST_LIMIT', 'Fiscal document list limit must be 1 to 500');
    }
    const allowed: readonly FiscalDocumentStatus[] = [
      'DRAFT','READY','SENDING','CONFIRMED','ISSUED_WITHOUT_EOR','RETRY_PENDING','REJECTED','MANUAL_REVIEW','REVERSED'
    ];
    if (status !== undefined && !allowed.includes(status)) {
      throw new FursDomainError('FURS_DB_LIST_STATUS', 'Fiscal document status filter is invalid');
    }
    const result = await this.#database.query<DocumentRow>(
      `select * from furs.fiscal_documents
       where ($1::text is null or status = $1) and ($3::uuid is null or legal_entity_id = $3)
       order by created_at desc limit $2`,
      [status ?? null, limit, legalEntityId ?? null]
    );
    return Object.freeze(result.rows.map(mapDocument));
  }

  public async getOperationalSummary(legalEntityId?: string): Promise<OperationalSummary> {
    const statuses = await this.#database.query<{ status: string; count: string } & QueryResultRow>(
      `select status, count(*)::text as count from furs.fiscal_documents
       where ($1::uuid is null or legal_entity_id = $1) group by status`,
      [legalEntityId ?? null]
    );
    const ages = await this.#database.query<{
      active_jobs: string; oldest_job: Date | string | null; oldest_document: Date | string | null;
      worker_last_seen: Date | string | null;
    } & QueryResultRow>(
      `select
         (select count(*)::text from furs.outbox_jobs job join furs.fiscal_documents document on document.id = job.document_id where job.status in ('PENDING','PROCESSING','RETRY') and ($1::uuid is null or document.legal_entity_id = $1)) as active_jobs,
         (select min(job.created_at) from furs.outbox_jobs job join furs.fiscal_documents document on document.id = job.document_id where job.status in ('PENDING','PROCESSING','RETRY') and ($1::uuid is null or document.legal_entity_id = $1)) as oldest_job,
         (select min(created_at) from furs.fiscal_documents where status in ('READY','SENDING','ISSUED_WITHOUT_EOR','RETRY_PENDING','MANUAL_REVIEW') and ($1::uuid is null or legal_entity_id = $1)) as oldest_document,
         (select max(last_seen_at) from furs.worker_heartbeats) as worker_last_seen`,
      [legalEntityId ?? null]
    );
    const row = ages.rows[0];
    if (row === undefined) throw new FursDomainError('FURS_DB_SUMMARY', 'Operational summary query failed');
    return Object.freeze({
      documentsByStatus: Object.freeze(Object.fromEntries(statuses.rows.map((entry) => [entry.status, Number(entry.count)]))),
      activeOutboxJobs: Number(row.active_jobs),
      oldestActiveOutboxAt: row.oldest_job === null ? undefined : instant(row.oldest_job),
      oldestUnconfirmedAt: row.oldest_document === null ? undefined : instant(row.oldest_document),
      workerLastSeenAt: row.worker_last_seen === null ? undefined : instant(row.worker_last_seen)
    });
  }

  public async heartbeatWorker(workerId: string, observedAt: Date): Promise<void> {
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(workerId) || !Number.isFinite(observedAt.getTime())) {
      throw new FursDomainError('FURS_WORKER_HEARTBEAT', 'Worker heartbeat is invalid');
    }
    await this.#database.query(
      `insert into furs.worker_heartbeats (worker_id, started_at, last_seen_at)
       values ($1, $2, $2)
       on conflict (worker_id) do update set last_seen_at = greatest(furs.worker_heartbeats.last_seen_at, excluded.last_seen_at)`,
      [workerId, observedAt]
    );
  }

  /** FURS-OUT-001/AUD-001: recover leases abandoned by a crashed worker. */
  public async recoverStaleOutboxJobs(staleBefore: Date): Promise<number> {
    return this.#database.transaction(async (client) => {
      const stale = await client.query<{ id: string; document_id: string; legal_entity_id: string; message_id: string; subsequent_submit: boolean } & QueryResultRow>(
        `select jobs.id::text, jobs.document_id, documents.legal_entity_id, documents.message_id, documents.subsequent_submit
         from furs.outbox_jobs jobs
         join furs.fiscal_documents documents on documents.id = jobs.document_id
         where jobs.status = 'PROCESSING' and jobs.locked_at < $1
         order by jobs.id for update of jobs, documents`,
        [staleBefore]
      );
      for (const job of stale.rows) {
        await client.query(
          `update furs.fiscal_documents set status = case when subsequent_submit then 'ISSUED_WITHOUT_EOR' else 'RETRY_PENDING' end
           where id = $1 and status = 'SENDING'`,
          [job.document_id]
        );
        await client.query(
          `update furs.outbox_jobs
           set status = 'RETRY', available_at = clock_timestamp(), locked_by = null,
               locked_at = null, last_error_code = 'WORKER_LEASE_EXPIRED', updated_at = clock_timestamp()
           where id = $1::bigint`,
          [job.id]
        );
        await appendAudit(client, {
          documentId: job.document_id,
          legalEntityId: job.legal_entity_id,
          eventType: 'WORKER_LEASE_RECOVERED',
          actorType: 'SYSTEM',
          correlationId: job.message_id,
          evidence: { jobId: job.id }
        });
      }
      return stale.rows.length;
    });
  }

  /** FURS-IDEMP-001/AUD-001: document, idempotency record, outbox and audit commit atomically. */
  public async prepareFiscalCommand(command: PreparedFiscalCommand): Promise<StoredFiscalDocument> {
    return this.#database.transaction(async (client) => {
      const replayResult = await client.query<DocumentRow>(
        `select * from furs.fiscal_documents
         where legal_entity_id = $1 and operation_class = 'FISCAL_INVOICE' and idempotency_key = $2`,
        [command.legalEntityId, command.idempotencyKey.toString()]
      );
      const replay = replayResult.rows[0];
      if (replay !== undefined) {
        if (replay.request_sha256 !== command.payloadSha256) {
          throw new FursDomainError('FURS_IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different immutable request');
        }
        return mapDocument(replay);
      }

      if (command.correctionOfOperationId !== undefined) {
        const original = await client.query<DocumentRow>(
          `select * from furs.fiscal_documents
           where id = $1 and legal_entity_id = $2 and operation_class = 'FISCAL_INVOICE'
             and status = 'CONFIRMED' for key share`,
          [command.correctionOfOperationId, command.legalEntityId]
        );
        const referenced = original.rows[0];
        if (referenced === undefined) {
          throw new FursDomainError('FURS_CORRECTION_REFERENCE', 'Correction/cancellation must reference a confirmed invoice from the configured legal entity');
        }
        if (
          referenced.business_premise_code === command.identity.businessPremiseId.toString() &&
          referenced.electronic_device_code === command.identity.electronicDeviceId.toString() &&
          String(referenced.invoice_sequence) === command.identity.invoiceSequence.toString()
        ) {
          throw new FursDomainError('FURS_CORRECTION_IDENTITY', 'Correction/cancellation requires a new fiscal identity');
        }
      }

      const inserted = await client.query<DocumentRow>(
        `insert into furs.fiscal_documents (
           id, legal_entity_id, operation_class, document_kind, correction_of_document_id,
           idempotency_key, request_sha256, status, business_premise_code,
           electronic_device_code, invoice_sequence, issue_local_time, message_id,
           schema_sha256, payload_json, payload_sha256, zoi, subsequent_submit
         ) values (
           $1, $2, 'FISCAL_INVOICE', $3, $4, $5, $6, $16, $7, $8,
           $9::bigint, $10, $11, $12, $13, $14, $15, $17
         )
         on conflict (legal_entity_id, operation_class, idempotency_key) do nothing
         returning *`,
        [
          command.operationId,
          command.legalEntityId,
          command.kind,
          command.correctionOfOperationId ?? null,
          command.idempotencyKey.toString(),
          command.payloadSha256,
          command.identity.businessPremiseId.toString(),
          command.identity.electronicDeviceId.toString(),
          command.identity.invoiceSequence.toString(),
          command.issueDateTime,
          command.messageId.toString(),
          command.schemaSha256,
          command.payloadJson,
          command.payloadSha256,
          command.zoi.toString(),
          command.issuedWithoutEor ? 'ISSUED_WITHOUT_EOR' : 'READY',
          command.issuedWithoutEor
        ]
      );

      const created = inserted.rows[0];
      if (created === undefined) {
        const existing = await client.query<DocumentRow>(
          `select * from furs.fiscal_documents
           where legal_entity_id = $1 and operation_class = 'FISCAL_INVOICE' and idempotency_key = $2`,
          [command.legalEntityId, command.idempotencyKey.toString()]
        );
        const row = existing.rows[0];
        if (row === undefined) throw new FursDomainError('FURS_DB_IDEMPOTENCY', 'Idempotent document disappeared');
        if (row.request_sha256 !== command.payloadSha256) {
          throw new FursDomainError(
            'FURS_IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used with a different immutable request'
          );
        }
        return mapDocument(row);
      }

      await client.query(
        `insert into furs.idempotency_ledger (
           legal_entity_id, operation_class, idempotency_key, request_sha256, document_id
         ) values ($1, 'FISCAL_INVOICE', $2, $3, $4)`,
        [created.legal_entity_id, created.idempotency_key, created.request_sha256, created.id]
      );
      await client.query(
        `insert into furs.outbox_jobs (document_id, job_type) values ($1, 'SUBMIT')`,
        [created.id]
      );
      await appendAudit(client, {
        documentId: created.id,
        legalEntityId: created.legal_entity_id,
        eventType: command.issuedWithoutEor ? 'FISCAL_ISSUED_WITHOUT_EOR_PREPARED' : 'FISCAL_DOCUMENT_PREPARED',
        actorType: 'API',
        correlationId: created.message_id,
        evidence: {
          payloadSha256: created.payload_sha256,
          schemaSha256: created.schema_sha256,
          status: created.status
        }
      });
      return mapDocument(created);
    });
  }

  /** FURS-PREM-001/IDEMP-001: registry, command, outbox and audit are one transaction. */
  public async prepareBusinessPremiseCommand(
    command: PreparedBusinessPremiseCommand,
    locationSnapshot: Readonly<object>,
    validityDate: string
  ): Promise<StoredFiscalDocument> {
    return this.#database.transaction(async (client) => {
      const existing = await client.query<DocumentRow>(
        `select * from furs.fiscal_documents
         where legal_entity_id = $1 and operation_class = 'BUSINESS_PREMISE' and idempotency_key = $2`,
        [command.legalEntityId, command.idempotencyKey.toString()]
      );
      const replay = existing.rows[0];
      if (replay !== undefined) {
        if (replay.request_sha256 !== command.payloadSha256) throw new FursDomainError('FURS_IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with a different premise request');
        return mapDocument(replay);
      }

      const premiseId = randomUUID();
      const premise = await client.query<{ id: string } & QueryResultRow>(
        `insert into furs.business_premises (
           id, legal_entity_id, business_premise_id, lifecycle_status, location_snapshot, validity_date
         ) values ($1, $2, $3, 'PENDING', $4::jsonb, $5::date)
         on conflict (legal_entity_id, business_premise_id) do update set
           lifecycle_status = 'PENDING', location_snapshot = excluded.location_snapshot,
           validity_date = excluded.validity_date, closed_at = null, updated_at = clock_timestamp()
         returning id`,
        [premiseId, command.legalEntityId, command.businessPremiseId.toString(), JSON.stringify(locationSnapshot), validityDate]
      );
      const premiseRecordId = premise.rows[0]?.id;
      if (premiseRecordId === undefined) throw new FursDomainError('FURS_DB_PREMISE', 'Business premise was not staged');

      const activeOperation = await client.query(
        `select 1
         from furs.business_premise_operations operation
         join furs.fiscal_documents document on document.id = operation.document_id
         where operation.business_premise_record_id = $1
           and document.status in ('READY','SENDING','ISSUED_WITHOUT_EOR','RETRY_PENDING','MANUAL_REVIEW')
         limit 1`,
        [premiseRecordId]
      );
      if (activeOperation.rows.length !== 0) {
        throw new FursDomainError('FURS_PREMISE_OPERATION_ACTIVE', 'Business premise already has an active lifecycle command');
      }

      const inserted = await client.query<DocumentRow>(
        `insert into furs.fiscal_documents (
           id, legal_entity_id, operation_class, document_kind, idempotency_key,
           request_sha256, status, business_premise_code, issue_local_time,
           message_id, schema_sha256, payload_json, payload_sha256
         ) values ($1, $2, 'BUSINESS_PREMISE', 'PREMISE', $3, $4, 'READY', $5, $6, $7, $8, $9, $10)
         returning *`,
        [command.operationId, command.legalEntityId, command.idempotencyKey.toString(), command.payloadSha256,
          command.businessPremiseId.toString(), command.sentAt, command.messageId.toString(), command.schemaSha256,
          command.payloadJson, command.payloadSha256]
      );
      const document = inserted.rows[0];
      if (document === undefined) throw new FursDomainError('FURS_DB_PREMISE', 'Premise command was not persisted');
      await client.query(
        `insert into furs.business_premise_operations (document_id, business_premise_record_id, requested_status)
         values ($1, $2, $3)`,
        [document.id, premiseRecordId, command.requestedStatus]
      );
      await client.query(
        `insert into furs.idempotency_ledger (legal_entity_id, operation_class, idempotency_key, request_sha256, document_id)
         values ($1, 'BUSINESS_PREMISE', $2, $3, $4)`,
        [document.legal_entity_id, document.idempotency_key, document.request_sha256, document.id]
      );
      await client.query(`insert into furs.outbox_jobs (document_id, job_type) values ($1, 'SUBMIT')`, [document.id]);
      await appendAudit(client, {
        documentId: document.id, legalEntityId: document.legal_entity_id,
        eventType: 'BUSINESS_PREMISE_PREPARED', actorType: 'API', correlationId: document.message_id,
        evidence: { payloadSha256: document.payload_sha256, schemaSha256: document.schema_sha256, requestedStatus: command.requestedStatus }
      });
      return mapDocument(document);
    });
  }

  public async getFiscalDocument(id: string, legalEntityId?: string): Promise<StoredFiscalDocument | undefined> {
    const result = await this.#database.query<DocumentRow>(
      'select * from furs.fiscal_documents where id = $1 and ($2::uuid is null or legal_entity_id = $2)',
      [id, legalEntityId ?? null]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapDocument(row);
  }

  /** Requirements: FURS-COR-001. Resolve protocol reference only from confirmed immutable evidence. */
  public async getConfirmedInvoiceReference(documentId: string, legalEntityId: string): Promise<ConfirmedInvoiceReference> {
    const result = await this.#database.query<DocumentRow>(
      `select * from furs.fiscal_documents
       where id = $1 and legal_entity_id = $2 and operation_class = 'FISCAL_INVOICE'
         and status = 'CONFIRMED'`,
      [documentId, legalEntityId]
    );
    const row = result.rows[0];
    if (row === undefined || row.electronic_device_code === null || row.invoice_sequence === null) {
      throw new FursDomainError(
        'FURS_CORRECTION_REFERENCE',
        'Correction/cancellation must reference a confirmed invoice from the configured legal entity'
      );
    }
    return Object.freeze({
      documentId: row.id,
      businessPremiseId: row.business_premise_code,
      electronicDeviceId: row.electronic_device_code,
      invoiceSequence: String(row.invoice_sequence),
      issueLocalTime: row.issue_local_time
    });
  }

  public async claimOutboxJobs(workerId: string, limit = 10): Promise<readonly ClaimedOutboxJob[]> {
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(workerId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new FursDomainError('FURS_OUTBOX_CLAIM', 'Worker claim parameters are invalid');
    }
    return this.#database.transaction(async (client) => {
      const result = await client.query<OutboxRow>(
        'select * from furs.claim_outbox_jobs($1::text, $2::integer, clock_timestamp())',
        [workerId, limit]
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            id: String(row.id),
            documentId: row.document_id,
            jobType: row.job_type,
            attemptCount: row.attempt_count,
            lockedBy: row.locked_by,
            lockedAt: instant(row.locked_at)
          })
        )
      );
    });
  }

  public async getPendingWebhookDelivery(documentId: string): Promise<PendingWebhookDelivery | undefined> {
    const result = await this.#database.query<WebhookRow>(
      `select id::text, document_id, destination_id, payload_json, payload_sha256
       from furs.webhook_deliveries
       where document_id = $1 and status in ('PENDING','RETRY') and available_at <= clock_timestamp()
       order by id limit 1`,
      [documentId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : Object.freeze({
      id: row.id, documentId: row.document_id, destinationId: row.destination_id,
      payloadJson: row.payload_json, payloadSha256: row.payload_sha256
    });
  }

  public async completeWebhook(job: ClaimedOutboxJob, delivery: PendingWebhookDelivery, deliveredAt: Date): Promise<void> {
    await this.#completeWebhookJob(job, delivery, 'DELIVERED', deliveredAt);
  }

  public async retryWebhook(
    job: ClaimedOutboxJob,
    delivery: PendingWebhookDelivery,
    availableAt: Date,
    webhookErrorCode: string
  ): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJob(client, job.id, job.lockedBy, job.documentId);
      const deliveryResult = await client.query(
        `update furs.webhook_deliveries set status = 'RETRY', attempt_count = $3,
           available_at = $4, last_error_code = $5, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2 and status in ('PENDING','RETRY') returning id`,
        [delivery.id, job.documentId, job.attemptCount, availableAt, webhookErrorCode]
      );
      if (deliveryResult.rows.length !== 1) throw new FursDomainError('FURS_WEBHOOK_STATE', 'Webhook delivery is not retryable');
      const outbox = await client.query(
        `update furs.outbox_jobs set status = 'RETRY', available_at = $4, locked_by = null,
           locked_at = null, last_error_code = $5, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2 and locked_by = $3 and status = 'PROCESSING' returning id`,
        [job.id, job.documentId, job.lockedBy, availableAt, webhookErrorCode]
      );
      if (outbox.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Webhook retry lease is not owned by worker');
      await appendWebhookAudit(client, job.documentId, 'WEBHOOK_RETRY_SCHEDULED', delivery, job.attemptCount, webhookErrorCode);
    });
  }

  public async deadLetterWebhook(
    job: ClaimedOutboxJob,
    delivery: PendingWebhookDelivery,
    webhookErrorCode: string,
    completedAt: Date
  ): Promise<void> {
    await this.#completeWebhookJob(job, delivery, 'DEAD', completedAt, webhookErrorCode);
  }

  public async startSending(documentId: string, workerId: string): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJobLease(client, documentId, workerId);
      const updated = await client.query(
        `update furs.fiscal_documents set status = 'SENDING'
         where id = $1 and status in ('READY','RETRY_PENDING','ISSUED_WITHOUT_EOR','MANUAL_REVIEW')
         returning id`,
        [documentId]
      );
      if (updated.rows.length !== 1) {
        throw new FursDomainError('FURS_DB_STATUS', 'Document could not transition to SENDING');
      }
    });
  }

  public async confirm(
    attempt: CompletedAttemptInput,
    eor: string,
    certificateFingerprint256: string
  ): Promise<void> {
    await this.#complete(attempt, 'CONFIRMED', async (client) => {
      const result = await client.query(
        `update furs.fiscal_documents
         set status = 'CONFIRMED', eor = $2::uuid,
             certificate_fingerprint_sha256 = $3, confirmed_at = $4
         where id = $1 and status = 'SENDING'
         returning id`,
        [attempt.documentId, eor, certificateFingerprint256, attempt.finishedAt]
      );
      if (result.rows.length !== 1) throw new FursDomainError('FURS_DB_CONFIRM', 'Document confirmation failed');
    });
  }

  public async reject(attempt: CompletedAttemptInput): Promise<void> {
    await this.#complete(attempt, 'REJECTED', async (client) => {
      await transitionFromSending(client, attempt.documentId, 'REJECTED');
    });
  }

  public async confirmBusinessPremise(attempt: CompletedAttemptInput, certificateFingerprint256: string): Promise<void> {
    await this.#complete(attempt, 'BUSINESS_PREMISE_CONFIRMED', async (client) => {
      const result = await client.query(
        `update furs.fiscal_documents set status = 'CONFIRMED',
           certificate_fingerprint_sha256 = $2, confirmed_at = $3
         where id = $1 and operation_class = 'BUSINESS_PREMISE' and status = 'SENDING' returning id`,
        [attempt.documentId, certificateFingerprint256, attempt.finishedAt]
      );
      if (result.rows.length !== 1) throw new FursDomainError('FURS_DB_CONFIRM', 'Premise confirmation failed');
      await client.query(
        `update furs.business_premises premise set
           lifecycle_status = operation.requested_status,
           closed_at = case when operation.requested_status = 'CLOSED' then $2::timestamptz else null::timestamptz end,
           updated_at = clock_timestamp()
         from furs.business_premise_operations operation
         where operation.document_id = $1 and premise.id = operation.business_premise_record_id`,
        [attempt.documentId, attempt.finishedAt]
      );
    });
  }

  public async rejectBusinessPremise(attempt: CompletedAttemptInput): Promise<void> {
    await this.#complete(attempt, 'BUSINESS_PREMISE_REJECTED', async (client) => {
      await transitionFromSending(client, attempt.documentId, 'REJECTED');
      await client.query(
        `update furs.business_premises premise set lifecycle_status = 'REJECTED', closed_at = null,
           updated_at = clock_timestamp()
         from furs.business_premise_operations operation
         where operation.document_id = $1 and premise.id = operation.business_premise_record_id`,
        [attempt.documentId]
      );
    });
  }

  public async scheduleRetry(attempt: CompletedAttemptInput, availableAt: Date): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJob(client, attempt.jobId, attempt.workerId, attempt.documentId);
      await insertAttempt(client, attempt);
      await transitionFromSending(client, attempt.documentId, 'RETRY_PENDING');
      const job = await client.query(
        `update furs.outbox_jobs
         set status = 'RETRY', available_at = $4, locked_by = null, locked_at = null,
             last_error_code = $5, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2::uuid and locked_by = $3 and status = 'PROCESSING'
         returning id`,
        [attempt.jobId, attempt.documentId, attempt.workerId, availableAt, attempt.errorCode ?? null]
      );
      if (job.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Retry lease is not owned by worker');
      await appendAttemptAudit(client, attempt, 'FISCAL_RETRY_SCHEDULED');
    });
  }

  public async markIssuedWithoutEor(attempt: CompletedAttemptInput, availableAt: Date): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJob(client, attempt.jobId, attempt.workerId, attempt.documentId);
      await insertAttempt(client, attempt);
      await transitionFromSending(client, attempt.documentId, 'ISSUED_WITHOUT_EOR');
      const job = await client.query(
        `update furs.outbox_jobs
         set status = 'RETRY', available_at = $4, locked_by = null, locked_at = null,
             last_error_code = $5, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2::uuid and locked_by = $3 and status = 'PROCESSING'
         returning id`,
        [attempt.jobId, attempt.documentId, attempt.workerId, availableAt, attempt.errorCode ?? null]
      );
      if (job.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Outage lease is not owned by worker');
      await appendAttemptAudit(client, attempt, 'FISCAL_ISSUED_WITHOUT_EOR');
    });
  }

  public async markManualReview(attempt: CompletedAttemptInput): Promise<void> {
    await this.#complete(attempt, 'MANUAL_REVIEW', async (client) => {
      await transitionFromSending(client, attempt.documentId, 'MANUAL_REVIEW');
    });
  }

  async #complete(
    attempt: CompletedAttemptInput,
    auditEvent: string,
    transition: (client: SqlClient) => Promise<void>
  ): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJob(client, attempt.jobId, attempt.workerId, attempt.documentId);
      await insertAttempt(client, attempt);
      await transition(client);
      const result = await client.query(
        `update furs.outbox_jobs
         set status = 'DONE', locked_by = null, locked_at = null,
             last_error_code = $4, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2::uuid and locked_by = $3 and status = 'PROCESSING'
         returning id`,
        [attempt.jobId, attempt.documentId, attempt.workerId, attempt.errorCode ?? null]
      );
      if (result.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Completion lease is not owned by worker');
      await appendAttemptAudit(client, attempt, auditEvent);
      await this.#scheduleWebhook(client, attempt.documentId);
    });
  }

  async #scheduleWebhook(client: SqlClient, documentId: string): Promise<void> {
    if (this.#webhookDestinationId === undefined) return;
    const documentResult = await client.query<DocumentRow>('select * from furs.fiscal_documents where id = $1', [documentId]);
    const document = documentResult.rows[0];
    if (document === undefined) throw new FursDomainError('FURS_DB_DOCUMENT', 'Webhook document disappeared');
    const payloadJson = JSON.stringify({
      event: 'fiscal-document.updated',
      document: {
        id: document.id, operationClass: document.operation_class, kind: document.document_kind,
        status: document.status, businessPremiseId: document.business_premise_code,
        ...(document.electronic_device_code === null ? {} : { electronicDeviceId: document.electronic_device_code }),
        ...(document.invoice_sequence === null ? {} : { invoiceSequence: String(document.invoice_sequence) }),
        messageId: document.message_id, payloadSha256: document.payload_sha256,
        ...(document.zoi === null ? {} : { zoi: document.zoi }),
        ...(document.eor === null ? {} : { eor: document.eor }),
        ...(document.confirmed_at === null ? {} : { confirmedAt: instant(document.confirmed_at) }),
        subsequentSubmit: document.subsequent_submit,
        updatedAt: instant(document.updated_at)
      }
    });
    const payloadSha256 = createHash('sha256').update(payloadJson, 'utf8').digest('hex');
    const delivery = await client.query<{ id: string } & QueryResultRow>(
      `insert into furs.webhook_deliveries (document_id, destination_id, payload_json, payload_sha256, status)
       values ($1, $2, $3, $4, 'PENDING')
       on conflict (document_id, destination_id) do nothing returning id::text`,
      [documentId, this.#webhookDestinationId, payloadJson, payloadSha256]
    );
    if (delivery.rows.length === 1) {
      await client.query(`insert into furs.outbox_jobs (document_id, job_type) values ($1, 'WEBHOOK')`, [documentId]);
    }
  }

  async #completeWebhookJob(
    job: ClaimedOutboxJob,
    delivery: PendingWebhookDelivery,
    status: 'DELIVERED' | 'DEAD',
    completedAt: Date,
    webhookErrorCode?: string
  ): Promise<void> {
    await this.#database.transaction(async (client) => {
      await assertJob(client, job.id, job.lockedBy, job.documentId);
      const deliveryResult = await client.query(
        `update furs.webhook_deliveries set status = $3, attempt_count = $4,
           delivered_at = case when $3::text = 'DELIVERED' then $5::timestamptz else null::timestamptz end,
           last_error_code = $6, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2 and status in ('PENDING','RETRY') returning id`,
        [delivery.id, job.documentId, status, job.attemptCount, completedAt, webhookErrorCode ?? null]
      );
      if (deliveryResult.rows.length !== 1) throw new FursDomainError('FURS_WEBHOOK_STATE', 'Webhook delivery could not be completed');
      const outbox = await client.query(
        `update furs.outbox_jobs set status = $4, locked_by = null, locked_at = null,
           last_error_code = $5, updated_at = clock_timestamp()
         where id = $1::bigint and document_id = $2 and locked_by = $3 and status = 'PROCESSING' returning id`,
        [job.id, job.documentId, job.lockedBy, status === 'DELIVERED' ? 'DONE' : 'DEAD', webhookErrorCode ?? null]
      );
      if (outbox.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Webhook completion lease is not owned by worker');
      await appendWebhookAudit(client, job.documentId, status === 'DELIVERED' ? 'WEBHOOK_DELIVERED' : 'WEBHOOK_DEAD', delivery, job.attemptCount, webhookErrorCode);
    });
  }
}

async function assertJobLease(client: SqlClient, documentId: string, workerId: string): Promise<void> {
  const result = await client.query(
    `select id from furs.outbox_jobs
     where document_id = $1 and locked_by = $2 and status = 'PROCESSING'`,
    [documentId, workerId]
  );
  if (result.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Worker does not own document lease');
}

async function assertJob(client: SqlClient, jobId: string, workerId: string, documentId: string): Promise<void> {
  const result = await client.query(
    `select id from furs.outbox_jobs
     where id = $1::bigint and document_id = $2::uuid and locked_by = $3 and status = 'PROCESSING'`,
    [jobId, documentId, workerId]
  );
  if (result.rows.length !== 1) throw new FursDomainError('FURS_OUTBOX_LEASE', 'Worker does not own job lease');
}

async function transitionFromSending(
  client: SqlClient,
  documentId: string,
  status: 'REJECTED' | 'RETRY_PENDING' | 'ISSUED_WITHOUT_EOR' | 'MANUAL_REVIEW'
): Promise<void> {
  const result = await client.query(
    'update furs.fiscal_documents set status = $2 where id = $1 and status = \'SENDING\' returning id',
    [documentId, status]
  );
  if (result.rows.length !== 1) throw new FursDomainError('FURS_DB_STATUS', `Document could not transition to ${status}`);
}

async function insertAttempt(client: SqlClient, attempt: CompletedAttemptInput): Promise<void> {
  await client.query(
    `insert into furs.fiscal_attempts (
       document_id, attempt_number, outcome, request_sha256, response_sha256,
       certificate_fingerprint_sha256, error_code, started_at, finished_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      attempt.documentId,
      attempt.attemptNumber,
      attempt.outcome,
      attempt.requestSha256,
      attempt.responseSha256 ?? null,
      attempt.certificateFingerprint256 ?? null,
      attempt.errorCode ?? null,
      attempt.startedAt,
      attempt.finishedAt
    ]
  );
}

interface AuditInput {
  readonly documentId?: string;
  readonly legalEntityId: string;
  readonly eventType: string;
  readonly actorType: 'API' | 'WORKER' | 'OPERATOR' | 'SYSTEM';
  readonly correlationId: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

async function appendAudit(client: SqlClient, input: AuditInput): Promise<void> {
  await client.query(
    `insert into furs.audit_events (
       document_id, legal_entity_id, event_type, actor_type, correlation_id, evidence
     ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.documentId ?? null,
      input.legalEntityId,
      input.eventType,
      input.actorType,
      input.correlationId,
      JSON.stringify(input.evidence)
    ]
  );
}

async function appendAttemptAudit(client: SqlClient, attempt: CompletedAttemptInput, eventType: string): Promise<void> {
  const result = await client.query<{ legal_entity_id: string; message_id: string } & QueryResultRow>(
    'select legal_entity_id, message_id from furs.fiscal_documents where id = $1',
    [attempt.documentId]
  );
  const document = result.rows[0];
  if (document === undefined) throw new FursDomainError('FURS_DB_DOCUMENT', 'Attempt document disappeared');
  await appendAudit(client, {
    documentId: attempt.documentId,
    legalEntityId: document.legal_entity_id,
    eventType,
    actorType: 'WORKER',
    correlationId: document.message_id,
    evidence: {
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      requestSha256: attempt.requestSha256,
      responseSha256: attempt.responseSha256 ?? null,
      errorCode: attempt.errorCode ?? null
    }
  });
}

async function appendWebhookAudit(
  client: SqlClient,
  documentId: string,
  eventType: string,
  delivery: PendingWebhookDelivery,
  attemptNumber: number,
  webhookErrorCode?: string
): Promise<void> {
  const result = await client.query<{ legal_entity_id: string; message_id: string } & QueryResultRow>(
    'select legal_entity_id, message_id from furs.fiscal_documents where id = $1', [documentId]
  );
  const document = result.rows[0];
  if (document === undefined) throw new FursDomainError('FURS_DB_DOCUMENT', 'Webhook audit document disappeared');
  await appendAudit(client, {
    documentId, legalEntityId: document.legal_entity_id, eventType, actorType: 'WORKER', correlationId: document.message_id,
    evidence: {
      destinationId: delivery.destinationId, payloadSha256: delivery.payloadSha256,
      attemptNumber, errorCode: webhookErrorCode ?? null
    }
  });
}
