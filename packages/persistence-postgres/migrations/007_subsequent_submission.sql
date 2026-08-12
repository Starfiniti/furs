begin;

alter table furs.fiscal_documents
  add column if not exists subsequent_submit boolean not null default false;

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
    or old.zoi is distinct from new.zoi
    or old.subsequent_submit is distinct from new.subsequent_submit then
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

commit;
