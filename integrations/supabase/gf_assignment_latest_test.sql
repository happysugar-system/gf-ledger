alter table public.gf_assignment_sync_queue_test add column queue_order bigint generated always as identity;
create unique index gf_assignment_sync_queue_test_order_idx on public.gf_assignment_sync_queue_test(queue_order);
create or replace function public.gf_assignment_transition_test(p_id text,p_expected text,p_next text,p_result text default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_id !~ '^TEST-[A-Z0-9-]{1,64}$' or not coalesce((p_expected='待機' and p_next in ('処理中','スキップ')) or (p_expected='処理中' and p_next in ('完了','エラー','要確認','スキップ')) or (p_expected='エラー' and p_next='待機'),false) then raise exception 'invalid_transition'; end if;
 update public.gf_assignment_sync_queue_test q set state=p_next,attempts=attempts+case when p_next='処理中' then 1 else 0 end,last_run_at=now()::text,result=p_result where request_id=p_id and state=p_expected and vehicle_id ~ '^V9[0-9]{5}$' and (p_next not in ('待機','処理中') or attempts<3) and (p_next not in ('処理中','完了') or not exists(select 1 from public.gf_assignment_sync_queue_test n where n.vehicle_id=q.vehicle_id and n.queue_order>q.queue_order)) and (p_next<>'処理中' or not exists(select 1 from public.gf_assignment_sync_queue_test n where n.vehicle_id=q.vehicle_id and n.state='処理中' and n.request_id<>q.request_id));
 return found;
end $$;
create function public.gf_assignment_candidates_test() returns setof public.gf_assignment_sync_queue_test language sql security invoker set search_path='' as $$ select q.* from public.gf_assignment_sync_queue_test q where q.state='待機' and q.attempts<3 order by q.queue_order limit 5 $$;
revoke all on function public.gf_assignment_candidates_test() from public,anon,authenticated;
grant execute on function public.gf_assignment_candidates_test() to service_role;