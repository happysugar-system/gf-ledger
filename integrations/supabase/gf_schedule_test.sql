-- Isolated validation storage; no production tables or calendar writes.
create table if not exists public.gf_schedule_test (
 schedule_id text primary key check(schedule_id like 'TEST-%'),
 vehicle_id text check(vehicle_id is null or vehicle_id ~ '^V9[0-9]{5}$'),
 schedule_type text not null,
 schedule_date date not null,
 state text,
 calendar_name text,
 calendar_event_id text,
 source_data jsonb not null check(jsonb_typeof(source_data)='object'),
 updated_at timestamptz not null default now()
);
create unique index if not exists gf_schedule_test_event_unique on public.gf_schedule_test(calendar_name,calendar_event_id) where calendar_event_id is not null and calendar_event_id <> '';
alter table public.gf_schedule_test enable row level security;
revoke all on public.gf_schedule_test from public,anon,authenticated;
grant select,insert,update,delete on public.gf_schedule_test to service_role;
