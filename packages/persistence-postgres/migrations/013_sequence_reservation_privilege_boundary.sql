begin;

-- Row locking requires privileges wider than the API role should hold. Keep
-- the lock/allocation operation behind this exact owner-controlled function.
alter function furs.reserve_invoice_sequence(uuid, text, text, text) security definer;
alter function furs.reserve_invoice_sequence(uuid, text, text, text) set search_path = pg_catalog, furs;
revoke all on function furs.reserve_invoice_sequence(uuid, text, text, text) from public;
grant execute on function furs.reserve_invoice_sequence(uuid, text, text, text) to furs_api;

commit;
