create function public.gf_assignment_transition_test(p_id text,p_expected text,p_next text,p_result text default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_id !~ '^TEST-[A-Z0-9-]{1,64}$' or not coalesce((p_expected='待機' and p_next='処理中') or (p_expected='処理中' and p_next in ('完了','エラー')) or (p_expected='エラー' and p_next='待機'),false) then raise exception 'invalid_transition'; end if;
 update public.gf_assignment_sync_queue_test set state=p_next,attempts=attempts+case when p_next='処理中' then 1 else 0 end,last_run_at=now()::text,result=p_result where request_id=p_id and state=p_expected and vehicle_id ~ '^V9[0-9]{5}$' and (p_next not in ('待機','処理中') or attempts<3);
 return found;
end $$;
revoke all on function public.gf_assignment_transition_test(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gf_assignment_transition_test(text,text,text,text) to service_role;