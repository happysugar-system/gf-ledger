create table public.gf_calendar_jobs_test (
 job_id text primary key check(job_id like 'TEST-%'),
 schedule_id text not null references public.gf_schedule_test(schedule_id),
 route_key text not null references public.gf_calendar_routes_test(route_key),
 operation text not null check(operation in ('update','create','cancel')),
 state text not null default 'waiting' check(state in ('waiting','processing','completed','retry','review')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 next_attempt_at timestamptz not null default now(),
 last_error text,
 updated_at timestamptz not null default now(),
 unique(schedule_id,operation)
);
alter table public.gf_calendar_jobs_test enable row level security;
revoke all on public.gf_calendar_jobs_test from public,anon,authenticated;
grant select,insert,update,delete on public.gf_calendar_jobs_test to service_role;
create index gf_calendar_jobs_test_pending on public.gf_calendar_jobs_test(next_attempt_at) where state in ('waiting','retry');