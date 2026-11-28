-- REVIEW ONLY. Do not run until production deployment is explicitly approved.
begin;
grant select(request_id,actor_id,vehicle_id,state,verified_fields,verified_at),insert,update on public.gf_vehicle_save_queue to service_role;
-- Worker RPCs use invoker privileges and need complete queue reads.
grant select on public.gf_vehicle_save_queue to service_role;
grant execute on function public.gf_vehicle_save_enqueue(uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.gf_vehicle_save_claim() to service_role;
grant execute on function public.gf_vehicle_save_finish(uuid,uuid,text,jsonb) to service_role;
commit;
