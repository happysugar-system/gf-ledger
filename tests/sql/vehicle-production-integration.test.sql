\set ON_ERROR_STOP on
create role anon;
create role authenticated;
-- Supabase service_role bypasses RLS; reproduce that property in disposable PostgreSQL.
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.gf_vehicles(vehicle_id text primary key,vehicle_data jsonb not null,updated_at timestamptz);
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into public.gf_vehicles values('V000001','{"GPS有無":false,"代車貸出先":"","代車貸出エリア":"","代車貸出備考":"","車種":"維持"}',now());
\ir ../../docs/sql/vehicle-production-queue-draft.sql
\ir ../../docs/sql/vehicle-production-worker-draft.sql
\ir ../../docs/sql/vehicle-production-activation-draft.sql
grant select,update on public.gf_vehicles to service_role;
set role service_role;
do $$
declare q jsonb; r jsonb; a uuid:='00000000-0000-4000-8000-000000000001'; id uuid:='00000000-0000-4000-8000-000000000002';
begin
 r:=public.gf_vehicle_save_enqueue(a,id,'V000001','{"GPS有無":false}','{"GPS有無":true}');
 if r->>'state'<>'queued' then raise exception 'enqueue failed'; end if;
 q:=public.gf_vehicle_save_claim();
 if q->>'request_id'<>id::text then raise exception 'claim failed'; end if;
 r:=public.gf_vehicle_save_finish(id,(q->>'lease')::uuid,'replica_verified','{"GPS有無":true,"代車貸出先":"","代車貸出エリア":"","代車貸出備考":""}');
 if r->>'state'<>'replica_verified' then raise exception 'finish failed'; end if;
 if not exists(select 1 from public.gf_vehicles where vehicle_id='V000001' and vehicle_data @> '{"GPS有無":true,"車種":"維持"}') then raise exception 'replica mismatch'; end if;
 r:=public.gf_vehicle_save_enqueue(a,id,'V000001','{"GPS有無":false}','{"GPS有無":true}');
 if r->>'state'<>'replica_verified' then raise exception 'idempotency failed'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.gf_vehicle_save_claim()','execute') or has_function_privilege('authenticated','public.gf_vehicle_save_claim()','execute') then raise exception 'permission leak'; end if;
end $$;
