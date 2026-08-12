begin;

create schema if not exists furs;
revoke all on schema furs from public;

create sequence if not exists furs.invoice_number_sequence
  as bigint minvalue 1 no maxvalue start 1 increment 1 cache 1 no cycle;

create table if not exists furs.legal_entities (
  id uuid primary key,
  tax_number text not null check (tax_number ~ '^[1-9][0-9]{7}$'),
  legal_name text not null check (char_length(legal_name) between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  unique (tax_number)
);

create table if not exists furs.certificate_profiles (
  id uuid primary key,
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  environment text not null check (environment in ('TEST', 'PRODUCTION')),
  fingerprint_sha256 text not null check (fingerprint_sha256 ~ '^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$'),
  subject_name text not null,
  issuer_name text not null,
  serial_number_decimal text not null check (serial_number_decimal ~ '^[0-9]+$'),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  check (valid_to > valid_from),
  unique (fingerprint_sha256)
);
create index if not exists certificate_profiles_legal_entity_idx
  on furs.certificate_profiles (legal_entity_id);
create unique index if not exists certificate_profiles_active_environment_idx
  on furs.certificate_profiles (legal_entity_id, environment)
  where active;

create table if not exists furs.business_premises (
  id uuid primary key,
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  business_premise_id text not null check (business_premise_id ~ '^[0-9A-Za-z]{1,20}$'),
  lifecycle_status text not null check (lifecycle_status in ('PENDING', 'REGISTERED', 'CLOSED', 'REJECTED')),
  location_snapshot jsonb not null check (jsonb_typeof(location_snapshot) = 'object'),
  validity_date date not null,
  closed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (legal_entity_id, business_premise_id),
  check ((lifecycle_status = 'CLOSED') = (closed_at is not null))
);
create index if not exists business_premises_legal_entity_idx
  on furs.business_premises (legal_entity_id);

create table if not exists furs.electronic_devices (
  id uuid primary key,
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  business_premise_id uuid not null references furs.business_premises(id) on delete restrict,
  electronic_device_id text not null check (electronic_device_id ~ '^[0-9A-Za-z]{1,20}$'),
  operational boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (business_premise_id, electronic_device_id)
);
create index if not exists electronic_devices_legal_entity_idx
  on furs.electronic_devices (legal_entity_id);
create index if not exists electronic_devices_premise_idx
  on furs.electronic_devices (business_premise_id);

create table if not exists furs.sequence_allocations (
  allocation_id bigint generated always as identity primary key,
  allocated_value bigint not null unique check (allocated_value > 0),
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  business_premise_code text not null check (business_premise_code ~ '^[0-9A-Za-z]{1,20}$'),
  electronic_device_code text not null check (electronic_device_code ~ '^[0-9A-Za-z]{1,20}$'),
  allocated_at timestamptz not null default clock_timestamp()
);
create index if not exists sequence_allocations_stream_idx
  on furs.sequence_allocations (legal_entity_id, business_premise_code, electronic_device_code, allocated_value);

create table if not exists furs.fiscal_documents (
  id uuid primary key,
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  operation_class text not null check (operation_class in ('FISCAL_INVOICE', 'BUSINESS_PREMISE')),
  document_kind text not null check (document_kind in ('STANDARD', 'CORRECTION', 'CANCELLATION', 'PREMISE')),
  correction_of_document_id uuid references furs.fiscal_documents(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('DRAFT','READY','SENDING','CONFIRMED','ISSUED_WITHOUT_EOR','RETRY_PENDING','REJECTED','MANUAL_REVIEW','REVERSED')),
  business_premise_code text not null check (business_premise_code ~ '^[0-9A-Za-z]{1,20}$'),
  electronic_device_code text,
  invoice_sequence bigint,
  issue_local_time text not null check (issue_local_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$'),
  message_id uuid not null,
  schema_sha256 text not null check (schema_sha256 ~ '^[a-f0-9]{64}$'),
  payload_json text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  zoi text,
  eor uuid,
  certificate_fingerprint_sha256 text,
  confirmed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (zoi is null or zoi ~ '^[a-f0-9]{32}$'),
  check ((operation_class = 'FISCAL_INVOICE') = (electronic_device_code is not null and invoice_sequence is not null and zoi is not null)),
  check ((document_kind = 'STANDARD' or document_kind = 'PREMISE') = (correction_of_document_id is null)),
  check ((status in ('CONFIRMED','REVERSED')) = (confirmed_at is not null)),
  check ((status in ('CONFIRMED','REVERSED') and operation_class = 'FISCAL_INVOICE') = (eor is not null)),
  unique (legal_entity_id, operation_class, idempotency_key),
  unique (legal_entity_id, business_premise_code, electronic_device_code, invoice_sequence)
);
create index if not exists fiscal_documents_legal_entity_status_idx
  on furs.fiscal_documents (legal_entity_id, status, created_at);
create index if not exists fiscal_documents_correction_idx
  on furs.fiscal_documents (correction_of_document_id)
  where correction_of_document_id is not null;
create index if not exists fiscal_documents_oldest_unconfirmed_idx
  on furs.fiscal_documents (created_at)
  where status in ('READY','SENDING','ISSUED_WITHOUT_EOR','RETRY_PENDING','MANUAL_REVIEW');

create table if not exists furs.idempotency_ledger (
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  operation_class text not null check (operation_class in ('FISCAL_INVOICE', 'BUSINESS_PREMISE')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  document_id uuid not null references furs.fiscal_documents(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (legal_entity_id, operation_class, idempotency_key),
  unique (document_id)
);
create index if not exists idempotency_ledger_document_idx on furs.idempotency_ledger (document_id);

create table if not exists furs.fiscal_attempts (
  id bigint generated always as identity primary key,
  document_id uuid not null references furs.fiscal_documents(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('STARTED','CONFIRMED','REJECTED','RETRYABLE_FAILURE','UNKNOWN_OUTCOME','SECURITY_FAILURE')),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  response_sha256 text check (response_sha256 is null or response_sha256 ~ '^[a-f0-9]{64}$'),
  certificate_fingerprint_sha256 text check (certificate_fingerprint_sha256 is null or certificate_fingerprint_sha256 ~ '^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$'),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_:-]{1,100}$'),
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (document_id, attempt_number),
  check ((outcome = 'STARTED') = (finished_at is null))
);
create index if not exists fiscal_attempts_document_idx on furs.fiscal_attempts (document_id, attempt_number);

create table if not exists furs.outbox_jobs (
  id bigint generated always as identity primary key,
  document_id uuid not null references furs.fiscal_documents(id) on delete restrict,
  job_type text not null check (job_type in ('SUBMIT','RECONCILE','WEBHOOK')),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','RETRY','DONE','DEAD')),
  available_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_by text,
  locked_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,100}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'PROCESSING') = (locked_by is not null and locked_at is not null))
);
create index if not exists outbox_jobs_document_idx on furs.outbox_jobs (document_id);
create index if not exists outbox_jobs_claim_idx
  on furs.outbox_jobs (available_at, id)
  where status in ('PENDING','RETRY');
create unique index if not exists outbox_jobs_active_document_idx
  on furs.outbox_jobs (document_id, job_type)
  where status in ('PENDING','PROCESSING','RETRY');

create table if not exists furs.audit_events (
  id bigint generated always as identity primary key,
  document_id uuid references furs.fiscal_documents(id) on delete restrict,
  legal_entity_id uuid not null references furs.legal_entities(id) on delete restrict,
  event_type text not null check (event_type ~ '^[A-Z0-9_:-]{1,100}$'),
  actor_type text not null check (actor_type in ('API','WORKER','OPERATOR','SYSTEM')),
  correlation_id uuid not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists audit_events_document_idx on furs.audit_events (document_id, id);
create index if not exists audit_events_legal_entity_idx on furs.audit_events (legal_entity_id, id);

create table if not exists furs.webhook_deliveries (
  id bigint generated always as identity primary key,
  document_id uuid not null references furs.fiscal_documents(id) on delete restrict,
  destination_id text not null check (char_length(destination_id) between 1 and 200),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('PENDING','DELIVERED','RETRY','DEAD')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default clock_timestamp(),
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists webhook_deliveries_document_idx on furs.webhook_deliveries (document_id);
create index if not exists webhook_deliveries_pending_idx on furs.webhook_deliveries (available_at, id)
  where status in ('PENDING','RETRY');

create table if not exists furs.compliance_source_versions (
  source_id text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  reviewed_by text not null,
  reviewed_at date not null,
  observed_at timestamptz not null default clock_timestamp(),
  primary key (source_id, sha256)
);

create or replace function furs.reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '55000', message = 'append-only fiscal evidence cannot be changed or deleted';
end;
$$;

drop trigger if exists fiscal_attempts_immutable on furs.fiscal_attempts;
create trigger fiscal_attempts_immutable before update or delete on furs.fiscal_attempts
for each row execute function furs.reject_mutation();
drop trigger if exists audit_events_immutable on furs.audit_events;
create trigger audit_events_immutable before update or delete on furs.audit_events
for each row execute function furs.reject_mutation();
drop trigger if exists sequence_allocations_immutable on furs.sequence_allocations;
create trigger sequence_allocations_immutable before update or delete on furs.sequence_allocations
for each row execute function furs.reject_mutation();
drop trigger if exists idempotency_ledger_immutable on furs.idempotency_ledger;
create trigger idempotency_ledger_immutable before update or delete on furs.idempotency_ledger
for each row execute function furs.reject_mutation();

create or replace function furs.guard_fiscal_document_update() returns trigger
language plpgsql as $$
declare
  allowed boolean := false;
begin
  if old.legal_entity_id is distinct from new.legal_entity_id
    or old.operation_class is distinct from new.operation_class
    or old.document_kind is distinct from new.document_kind
    or old.correction_of_document_id is distinct from new.correction_of_document_id
    or old.idempotency_key is distinct from new.idempotency_key
    or old.request_sha256 is distinct from new.request_sha256
    or old.business_premise_code is distinct from new.business_premise_code
    or old.electronic_device_code is distinct from new.electronic_device_code
    or old.invoice_sequence is distinct from new.invoice_sequence
    or old.issue_local_time is distinct from new.issue_local_time
    or old.message_id is distinct from new.message_id
    or old.schema_sha256 is distinct from new.schema_sha256
    or old.payload_json is distinct from new.payload_json
    or old.payload_sha256 is distinct from new.payload_sha256
    or old.zoi is distinct from new.zoi then
    raise exception using errcode = '55000', message = 'immutable fiscal document fields cannot be changed';
  end if;

  allowed := case old.status
    when 'DRAFT' then new.status in ('READY')
    when 'READY' then new.status in ('SENDING','MANUAL_REVIEW')
    when 'SENDING' then new.status in ('CONFIRMED','ISSUED_WITHOUT_EOR','RETRY_PENDING','REJECTED','MANUAL_REVIEW')
    when 'CONFIRMED' then new.status in ('REVERSED')
    when 'ISSUED_WITHOUT_EOR' then new.status in ('SENDING','MANUAL_REVIEW')
    when 'RETRY_PENDING' then new.status in ('SENDING','MANUAL_REVIEW')
    when 'MANUAL_REVIEW' then new.status in ('SENDING','REJECTED')
    else false
  end;
  if old.status is distinct from new.status and not allowed then
    raise exception using errcode = '55000', message = 'invalid fiscal document status transition';
  end if;
  if old.eor is not null and old.eor is distinct from new.eor then
    raise exception using errcode = '55000', message = 'confirmed EOR cannot be changed';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists fiscal_documents_guard on furs.fiscal_documents;
create trigger fiscal_documents_guard before update on furs.fiscal_documents
for each row execute function furs.guard_fiscal_document_update();
drop trigger if exists fiscal_documents_no_delete on furs.fiscal_documents;
create trigger fiscal_documents_no_delete before delete on furs.fiscal_documents
for each row execute function furs.reject_mutation();

create or replace function furs.allocate_invoice_sequence(
  p_legal_entity_id uuid,
  p_business_premise_code text,
  p_electronic_device_code text
) returns bigint
language plpgsql security invoker as $$
declare
  allocated bigint;
begin
  allocated := nextval('furs.invoice_number_sequence');
  insert into furs.sequence_allocations (
    allocated_value, legal_entity_id, business_premise_code, electronic_device_code
  ) values (
    allocated, p_legal_entity_id, p_business_premise_code, p_electronic_device_code
  );
  return allocated;
end;
$$;

create or replace function furs.claim_outbox_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_now timestamptz default clock_timestamp()
) returns setof furs.outbox_jobs
language sql security invoker as $$
  with candidates as (
    select id
    from furs.outbox_jobs
    where status in ('PENDING','RETRY') and available_at <= p_now
    order by available_at, id
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update furs.outbox_jobs as jobs
  set status = 'PROCESSING',
      locked_by = p_worker_id,
      locked_at = p_now,
      attempt_count = jobs.attempt_count + 1,
      updated_at = p_now
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
$$;

commit;
