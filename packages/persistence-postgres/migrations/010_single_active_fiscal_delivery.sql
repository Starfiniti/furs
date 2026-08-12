begin;

do $$
begin
  if exists (
    select 1
    from furs.outbox_jobs
    where job_type in ('SUBMIT', 'RECONCILE')
      and status in ('PENDING', 'PROCESSING', 'RETRY')
    group by document_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'active SUBMIT/RECONCILE duplicates require reviewed migration remediation';
  end if;
end;
$$;

drop index if exists furs.outbox_jobs_active_document_idx;

create unique index if not exists outbox_jobs_active_fiscal_document_idx
  on furs.outbox_jobs (document_id)
  where job_type in ('SUBMIT', 'RECONCILE')
    and status in ('PENDING', 'PROCESSING', 'RETRY');

create unique index if not exists outbox_jobs_active_webhook_document_idx
  on furs.outbox_jobs (document_id)
  where job_type = 'WEBHOOK'
    and status in ('PENDING', 'PROCESSING', 'RETRY');

commit;
