-- REVIEW ONLY. Requires vehicle-production-queue-draft.sql.
-- No execute grants: activation requires separate reviewed deployment.
begin;
create function public.gf_vehicle_save_enqueue(p_actor uuid,p_request uuid,p_vehicle text,p_expected jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.gf_vehicle_save_queue%rowtype; k text; v jsonb; current_fields jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(7642301);
 if p_actor is null or p_request is null or p_vehicle is null or p_vehicle !~ '^V[0-9]{6}$' or p_vehicle='V999999' or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}'::jsonb then raise exception 'invalid_request'; end if;
 if (select array_agg(x order by x) from jsonb_object_keys(p_expected) x) is distinct from (select array_agg(x order by x) from jsonb_object_keys(p_changes) x) then raise exception 'invalid_keys'; end if;
 for k in select jsonb_object_keys(p_changes) loop
  if k not in ('GPS有無','代車貸出先','代車貸出エリア','代車貸出備考') or p_expected->k=p_changes->k then raise exception 'invalid_field'; end if;
  for v in select p_expected->k union all select p_changes->k loop
   if k='GPS有無' then
    if jsonb_typeof(v)<>'boolean' then raise exception 'invalid_boolean'; end if;
   elsif jsonb_typeof(v)<>'string' or length(v#>>'{}')>1000 or (v#>>'{}') ~ '^[[:space:]]*[=+@-]' then raise exception 'invalid_text'; end if;
  end loop;
 end loop;
 select * into q from public.gf_vehicle_save_queue where request_id=p_request;
 if found then
  if q.actor_id<>p_actor or q.vehicle_id<>p_vehicle or q.expected<>p_expected or q.changes<>p_changes then raise exception 'request_conflict'; end if;
  return jsonb_build_object('request_id',q.request_id,'state',q.state);
 end if;
 select vehicle_data into current_fields from public.gf_vehicles where vehicle_id=p_vehicle;
 if not found or not coalesce(current_fields @> p_expected,false) then raise exception 'stale_replica'; end if;
 insert into public.gf_vehicle_save_queue(request_id,actor_id,vehicle_id,expected,changes) values(p_request,p_actor,p_vehicle,p_expected,p_changes);
 return jsonb_build_object('request_id',p_request,'state','queued');
end $$;
create function public.gf_vehicle_save_claim()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.gf_vehicle_save_queue%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(7642301);
 update public.gf_vehicle_save_queue set state='reconciliation_required' where state='processing' and lease_until<=clock_timestamp();
 select * into q from public.gf_vehicle_save_queue where state='queued' order by created_at,request_id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.gf_vehicle_save_queue set state='processing',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where request_id=q.request_id returning * into q;
 return to_jsonb(q);
end $$;
create function public.gf_vehicle_save_finish(p_request uuid,p_lease uuid,p_state text,p_fields jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.gf_vehicle_save_queue%rowtype; k text;
begin
 perform pg_catalog.pg_advisory_xact_lock(7642301);
 select * into q from public.gf_vehicle_save_queue where request_id=p_request for update;
 if not found or p_lease is null or q.lease is distinct from p_lease then raise exception 'invalid_lease'; end if;
 if q.state='replica_verified' and p_state=q.state and q.verified_fields=p_fields then return jsonb_build_object('state',q.state); end if;
 if q.state<>'processing' or q.lease_until is null or q.lease_until<=clock_timestamp() then raise exception 'expired_lease'; end if;
 if p_state is null or p_state not in ('replica_verified','conflict','reconciliation_required') then raise exception 'invalid_state'; end if;
 if p_state='replica_verified' then
  if jsonb_typeof(p_fields) is distinct from 'object' or not coalesce(p_fields @> q.changes,false) or (select count(*) from jsonb_object_keys(p_fields))<>4 then raise exception 'unverified_fields'; end if;
  foreach k in array array['GPS有無','代車貸出先','代車貸出エリア','代車貸出備考'] loop
   if jsonb_typeof(p_fields->k) is distinct from (case when k='GPS有無' then 'boolean' else 'string' end) then raise exception 'invalid_observation'; end if;
  end loop;
  -- Compare replica before merging changed keys only; other fields untouched.
  update public.gf_vehicles set vehicle_data=vehicle_data||q.changes,updated_at=clock_timestamp() where vehicle_id=q.vehicle_id and vehicle_data @> q.expected;
  if not found and not exists(select 1 from public.gf_vehicles where vehicle_id=q.vehicle_id and vehicle_data @> q.changes) then p_state:='reconciliation_required'; end if;
 end if;
 update public.gf_vehicle_save_queue set state=p_state,verified_fields=case when p_state='replica_verified' then p_fields else null end,verified_at=case when p_state='replica_verified' then clock_timestamp() else null end where request_id=p_request;
 return jsonb_build_object('state',p_state);
end $$;
revoke all on function public.gf_vehicle_save_enqueue(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.gf_vehicle_save_claim() from public,anon,authenticated,service_role;
revoke all on function public.gf_vehicle_save_finish(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
commit;
