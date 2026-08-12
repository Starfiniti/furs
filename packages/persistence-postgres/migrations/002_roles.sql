begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'furs_api') then
    create role furs_api nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'furs_worker') then
    create role furs_worker nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'furs_readonly') then
    create role furs_readonly nologin;
  end if;
end;
$$;

revoke all on schema furs from public;
grant usage on schema furs to furs_api, furs_worker, furs_readonly;

grant select on furs.legal_entities, furs.certificate_profiles, furs.business_premises,
  furs.electronic_devices, furs.fiscal_documents, furs.fiscal_attempts, furs.audit_events
  to furs_readonly;

grant select, insert on furs.fiscal_documents, furs.idempotency_ledger, furs.audit_events,
  furs.business_premises, furs.electronic_devices to furs_api;
grant select on furs.legal_entities, furs.certificate_profiles, furs.sequence_allocations,
  furs.outbox_jobs, furs.fiscal_attempts, furs.webhook_deliveries,
  furs.compliance_source_versions to furs_api;
grant update on furs.business_premises, furs.electronic_devices, furs.outbox_jobs to furs_api;
grant update (status, eor, certificate_fingerprint_sha256, confirmed_at, updated_at)
  on furs.fiscal_documents to furs_api;
grant insert on furs.sequence_allocations, furs.outbox_jobs to furs_api;
grant usage, select on sequence furs.invoice_number_sequence to furs_api;
grant usage, select on all sequences in schema furs to furs_api;
grant execute on function furs.allocate_invoice_sequence(uuid, text, text) to furs_api;

grant select, insert on furs.fiscal_attempts, furs.audit_events, furs.webhook_deliveries to furs_worker;
grant select, update on furs.fiscal_documents, furs.outbox_jobs, furs.webhook_deliveries to furs_worker;
grant usage, select on all sequences in schema furs to furs_worker;
grant execute on function furs.claim_outbox_jobs(text, integer, timestamptz) to furs_worker;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'furs_api_login') then
    grant furs_api to furs_api_login;
  end if;
  if exists (select 1 from pg_roles where rolname = 'furs_worker_login') then
    grant furs_worker to furs_worker_login;
  end if;
  if exists (select 1 from pg_roles where rolname = 'furs_readonly_login') then
    grant furs_readonly to furs_readonly_login;
  end if;
end;
$$;

commit;
