begin;

-- FURS-ID-002/OUT-001/REL-001: keep one bounded, atomic SKIP LOCKED claim
-- while allowing the reviewed Phase 7 test worker capacity.
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
    limit greatest(1, least(p_limit, 250))
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
