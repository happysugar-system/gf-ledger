create table if not exists public.gf_calendar_routes_test (
 route_key text primary key,
 calendar_id text,
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 check (not enabled or nullif(btrim(calendar_id),'') is not null)
);
alter table public.gf_calendar_routes_test enable row level security;
revoke all on public.gf_calendar_routes_test from public, anon, authenticated;
grant select,insert,update,delete on public.gf_calendar_routes_test to service_role;
insert into public.gf_calendar_routes_test(route_key) values ('納車'),('代車'),('車検'),('車検満了'),('名変'),('整備・点検'),('スタッフシフト') on conflict do nothing;