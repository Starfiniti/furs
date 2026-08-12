begin;

create table if not exists furs.business_premise_operations (
  document_id uuid primary key references furs.fiscal_documents(id) on delete restrict,
  business_premise_record_id uuid not null references furs.business_premises(id) on delete restrict,
  requested_status text not null check (requested_status in ('REGISTERED','CLOSED')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists business_premise_operations_record_idx
  on furs.business_premise_operations (business_premise_record_id, created_at);

drop trigger if exists business_premise_operations_immutable on furs.business_premise_operations;
create trigger business_premise_operations_immutable before update or delete on furs.business_premise_operations
for each row execute function furs.reject_mutation();

grant select, insert on furs.business_premise_operations to furs_api;
grant select on furs.business_premise_operations to furs_worker;
grant update on furs.business_premises to furs_worker;

commit;
