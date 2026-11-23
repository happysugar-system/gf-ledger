-- Draft for isolated demo only. Not a production migration.
begin;
create table public.gf_vehicle_save_queue_test (
 request_id uuid primary key,
 actor_id uuid not null,
 vehicle_id text not null check (vehicle_id='V999999'),
 expected_gps boolean not null,
 desired_gps boolean not null,
 state text not null default 'queued' check (state in ('queued','processing','sheet_verified','replica_verified','conflict','rejected','reconciliation_required')),
 lease uuid,
 lease_until timestamptz,
 created_at timestamptz not null default now()
);
alter table public.gf_vehicle_save_queue_test enable row level security;
revoke all on public.gf_vehicle_save_queue_test from public,anon,authenticated,service_role;
grant select,insert,update on public.gf_vehicle_save_queue_test to service_role;
create function public.gf_vehicle_save_claim_test()
returns setof public.gf_vehicle_save_queue_test
language plpgsql security invoker set search_path='' as $$
begin
 update public.gf_vehicle_save_queue_test set state='reconciliation_required'
 where state='processing' and lease_until<=clock_timestamp();
 return query
 update public.gf_vehicle_save_queue_test q
 set state='processing',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes'
 where q.request_id=(select x.request_id from public.gf_vehicle_save_queue_test x where x.state='queued' order by x.created_at,x.request_id limit 1 for update skip locked)
 returning q.*;
end;
$$;
revoke all on function public.gf_vehicle_save_claim_test() from public,anon,authenticated;
grant execute on function public.gf_vehicle_save_claim_test() to service_role;
commit;
