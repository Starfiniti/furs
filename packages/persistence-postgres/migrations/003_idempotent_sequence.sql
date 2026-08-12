begin;

alter table furs.sequence_allocations
  add column if not exists idempotency_key text;

alter table furs.sequence_allocations
  drop constraint if exists sequence_allocations_idempotency_key_check;
alter table furs.sequence_allocations
  add constraint sequence_allocations_idempotency_key_check
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 128);

create unique index if not exists sequence_allocations_idempotency_idx
  on furs.sequence_allocations (legal_entity_id, idempotency_key)
  where idempotency_key is not null;

create or replace function furs.reserve_invoice_sequence(
  p_legal_entity_id uuid,
  p_business_premise_code text,
  p_electronic_device_code text,
  p_idempotency_key text
) returns bigint
language plpgsql security invoker as $$
declare
  allocated bigint;
begin
  select allocated_value into allocated
  from furs.sequence_allocations
  where legal_entity_id = p_legal_entity_id and idempotency_key = p_idempotency_key;
  if found then
    return allocated;
  end if;

  allocated := nextval('furs.invoice_number_sequence');
  insert into furs.sequence_allocations (
    allocated_value, legal_entity_id, business_premise_code,
    electronic_device_code, idempotency_key
  ) values (
    allocated, p_legal_entity_id, p_business_premise_code,
    p_electronic_device_code, p_idempotency_key
  )
  on conflict (legal_entity_id, idempotency_key)
    where idempotency_key is not null
  do nothing;

  if not found then
    select allocated_value into allocated
    from furs.sequence_allocations
    where legal_entity_id = p_legal_entity_id and idempotency_key = p_idempotency_key;
  end if;
  return allocated;
end;
$$;

grant execute on function furs.reserve_invoice_sequence(uuid, text, text, text) to furs_api;

commit;
