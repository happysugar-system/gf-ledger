-- REVIEW ONLY. Do not execute on production before approval.
begin;
create table public.gf_vehicle_save_queue (
 request_id uuid primary key,
 actor_id uuid not null references auth.users(id),
 vehicle_id text not null check(vehicle_id ~ '^V[0-9]{6}$' and vehicle_id <> 'V999999'),
 expected jsonb not null,
 changes jsonb not null,
 state text not null default 'queued' check(state in ('queued','processing','replica_verified','conflict','rejected','reconciliation_required')),
 lease uuid,
 lease_until timestamptz,
 verified_fields jsonb,
 created_at timestamptz not null default clock_timestamp(),
 verified_at timestamptz,
 check(jsonb_typeof(expected)='object' and jsonb_typeof(changes)='object' and changes<>'{}'::jsonb),
 check(state<>'replica_verified' or (verified_at is not null and verified_fields is not null and jsonb_typeof(verified_fields)='object' and verified_fields @> changes))
);
create unique index gf_vehicle_save_one_pending on public.gf_vehicle_save_queue(vehicle_id) where state in ('queued','processing','reconciliation_required');
alter table public.gf_vehicle_save_queue enable row level security;
revoke all on public.gf_vehicle_save_queue from public, anon, authenticated, service_role;
-- No API grants or worker functions yet: deliberately disabled.
commit;
