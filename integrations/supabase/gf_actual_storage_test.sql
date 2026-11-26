create table public.gf_actual_queue_test (
 receipt_id text primary key check (receipt_id like 'TEST-%'),
 received_at text not null, vehicle_id text not null check (vehicle_id like 'V9%'),
 kind text not null, actual_date date not null, driver_id text, current_user_name text,
 state text not null, detail text, completed_at text
);
create table public.gf_actual_history_test (
 receipt_id text primary key references public.gf_actual_queue_test(receipt_id),
 registered_at text not null, vehicle_id text not null check (vehicle_id like 'V9%'),
 kind text not null, actual_date date not null, state text not null,
 before_data jsonb not null, after_data jsonb not null, cancelled_at text, notes text
);
alter table public.gf_actual_queue_test enable row level security;
alter table public.gf_actual_history_test enable row level security;
revoke all on public.gf_actual_queue_test, public.gf_actual_history_test from public, anon, authenticated;
grant select, insert, update, delete on public.gf_actual_queue_test, public.gf_actual_history_test to service_role;