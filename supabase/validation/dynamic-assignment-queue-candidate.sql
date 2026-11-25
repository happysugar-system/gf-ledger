-- Review-only migration candidate. Do not apply to production.
-- Separate queue preserves fixed-ID worker behavior.
begin;
create table public.gf_assignment_dynamic_queue_test (
 request_id uuid primary key,
 actor_id uuid not null,
 receipt_id text not null check (length(receipt_id) between 1 and 150 and receipt_id=btrim(receipt_id) and receipt_id !~ '[\r\n]'),
 driver_id text not null check (driver_id ~ '^D[0-9]{6}$'),
 vehicle_id text not null check (vehicle_id ~ '^V[0-9]{6}$'),
 action text not null check (action in ('assign','cancel')),
 expected_version text not null check (expected_version ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check (state in ('pending','processing','verified','reconciliation_required','rejected')),
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 verified_at timestamptz,
 error_code text
);
create unique index gf_dynamic_active_vehicle on public.gf_assignment_dynamic_queue_test(vehicle_id) where state in ('pending','processing','reconciliation_required');
create unique index gf_dynamic_active_driver on public.gf_assignment_dynamic_queue_test(driver_id) where state in ('pending','processing','reconciliation_required');
create unique index gf_dynamic_active_receipt on public.gf_assignment_dynamic_queue_test(receipt_id) where state in ('pending','processing','reconciliation_required');
alter table public.gf_assignment_dynamic_queue_test enable row level security;
revoke all on public.gf_assignment_dynamic_queue_test from public,anon,authenticated;
grant select,insert,update on public.gf_assignment_dynamic_queue_test to service_role;
commit;
