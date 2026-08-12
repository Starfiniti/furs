begin;

alter table furs.webhook_deliveries
  add column if not exists payload_json text;
update furs.webhook_deliveries
set payload_json = '{}', payload_sha256 = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'
where payload_json is null;
alter table furs.webhook_deliveries alter column payload_json set not null;
alter table furs.webhook_deliveries
  add column if not exists last_error_code text
  check (last_error_code is null or last_error_code ~ '^[A-Z0-9_:-]{1,100}$');
alter table furs.webhook_deliveries
  add column if not exists updated_at timestamptz not null default clock_timestamp();

create unique index if not exists webhook_deliveries_document_destination_idx
  on furs.webhook_deliveries (document_id, destination_id);

commit;
