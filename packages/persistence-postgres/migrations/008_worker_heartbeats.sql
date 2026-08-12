begin;

create table if not exists furs.worker_heartbeats (
  worker_id text primary key check (worker_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  check (last_seen_at >= started_at)
);

grant select on furs.worker_heartbeats to furs_api, furs_worker, furs_readonly;
grant insert, update on furs.worker_heartbeats to furs_worker;

commit;
