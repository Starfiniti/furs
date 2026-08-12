begin;

create or replace function furs.activate_certificate_profile(
  p_profile_id uuid,
  p_legal_entity_id uuid,
  p_environment text,
  p_fingerprint_sha256 text,
  p_subject_name text,
  p_issuer_name text,
  p_serial_number_decimal text,
  p_valid_from timestamptz,
  p_valid_to timestamptz
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, furs
as $$
declare
  current_profile furs.certificate_profiles%rowtype;
  activated_id uuid;
begin
  perform 1 from furs.legal_entities
  where id = p_legal_entity_id and active
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FURS_LEGAL_ENTITY_NOT_ACTIVE';
  end if;

  select * into current_profile
  from furs.certificate_profiles
  where legal_entity_id = p_legal_entity_id
    and environment = p_environment
    and active;

  if found and current_profile.fingerprint_sha256 = p_fingerprint_sha256 then
    return current_profile.id;
  end if;

  update furs.certificate_profiles
  set active = false
  where legal_entity_id = p_legal_entity_id
    and environment = p_environment
    and active;

  insert into furs.certificate_profiles (
    id, legal_entity_id, environment, fingerprint_sha256, subject_name,
    issuer_name, serial_number_decimal, valid_from, valid_to, active
  ) values (
    p_profile_id, p_legal_entity_id, p_environment, p_fingerprint_sha256,
    p_subject_name, p_issuer_name, p_serial_number_decimal,
    p_valid_from, p_valid_to, true
  )
  on conflict (fingerprint_sha256) do update
  set active = true
  where certificate_profiles.legal_entity_id = excluded.legal_entity_id
    and certificate_profiles.environment = excluded.environment
  returning id into activated_id;

  if activated_id is null then
    raise exception using errcode = '23505', message = 'FURS_CERTIFICATE_PROFILE_CONFLICT';
  end if;

  insert into furs.audit_events (
    document_id, legal_entity_id, event_type, actor_type, correlation_id, evidence
  ) values (
    null,
    p_legal_entity_id,
    'CERTIFICATE_PROFILE_ACTIVATED',
    'SYSTEM',
    activated_id,
    jsonb_build_object(
      'environment', p_environment,
      'fingerprintSuffix', right(replace(p_fingerprint_sha256, ':', ''), 12),
      'validTo', p_valid_to
    )
  );

  return activated_id;
end;
$$;

revoke all on function furs.activate_certificate_profile(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz
) from public;
grant execute on function furs.activate_certificate_profile(
  uuid, uuid, text, text, text, text, text, timestamptz, timestamptz
) to furs_api, furs_worker;

drop trigger if exists compliance_source_versions_immutable on furs.compliance_source_versions;
create trigger compliance_source_versions_immutable
before update or delete on furs.compliance_source_versions
for each row execute function furs.reject_mutation();

commit;
