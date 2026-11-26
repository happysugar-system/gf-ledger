create or replace function public.gf_assignment_candidates_test() returns setof public.gf_assignment_sync_queue_test language plpgsql security invoker set search_path='' as $$
begin
 update public.gf_assignment_sync_queue_test q set state='スキップ',result='同じ車両の新しい依頼あり',last_run_at=now()::text
 where q.state='待機' and exists(select 1 from public.gf_assignment_sync_queue_test n where n.vehicle_id=q.vehicle_id and n.queue_order>q.queue_order);
 return query select q.* from public.gf_assignment_sync_queue_test q where q.state='待機' and q.attempts<3 and not exists(select 1 from public.gf_assignment_sync_queue_test n where n.vehicle_id=q.vehicle_id and n.state='処理中') order by q.queue_order limit 5;
end $$;