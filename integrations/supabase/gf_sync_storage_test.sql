create table public.gf_line_driver_sync_history_test(receipt_key text primary key, receipt_number text, line_receipt_id text, state text, driver_id text, processed_at text, notes text);
create table public.gf_assignment_sync_queue_test(request_id text primary key, requested_at text, vehicle_id text, operation text, driver_id text, state text, attempts integer not null default 0 check(attempts>=0), last_run_at text, result text);
alter table public.gf_line_driver_sync_history_test enable row level security;
alter table public.gf_assignment_sync_queue_test enable row level security;
revoke all on public.gf_line_driver_sync_history_test,public.gf_assignment_sync_queue_test from public,anon,authenticated;
grant select,insert,update,delete on public.gf_line_driver_sync_history_test,public.gf_assignment_sync_queue_test to service_role;