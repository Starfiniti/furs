begin;

-- Confirmation/rejection updates match a premise row by its internal ID. The
-- worker already has UPDATE from migration 004, but PostgreSQL also requires
-- SELECT on every column referenced by the UPDATE predicate.
grant select (id) on furs.business_premises to furs_worker;

commit;
