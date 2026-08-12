begin;

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
  if found then return allocated; end if;

  perform 1
  from furs.legal_entities entity
  join furs.business_premises premise on premise.legal_entity_id = entity.id
  join furs.electronic_devices device on device.business_premise_id = premise.id
  where entity.id = p_legal_entity_id
    and entity.active
    and premise.business_premise_id = p_business_premise_code
    and premise.lifecycle_status = 'REGISTERED'
    and device.electronic_device_id = p_electronic_device_code
    and device.operational
  for key share of entity, premise, device;
  if not found then
    raise exception using errcode = 'P0001', message = 'FURS_DEVICE_OR_PREMISE_NOT_OPERATIONAL';
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
