create function public.gf_actual_transition_test(p_receipt text,p_expected text,p_next text,p_detail text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
 if p_receipt not like 'TEST-%' or not ((p_expected='待機' and p_next='処理中') or (p_expected='処理中' and p_next in ('完了','エラー')) or (p_expected='完了' and p_next='取消処理中') or (p_expected='取消処理中' and p_next in ('取消済','完了'))) then raise exception 'invalid_transition'; end if;
 update public.gf_actual_queue_test set state=p_next,detail=p_detail,completed_at=case when p_next in ('完了','取消済') then now()::text else completed_at end where receipt_id=p_receipt and state=p_expected;
 get diagnostics n=row_count;
 if n=0 then return false; end if;
 if p_next in ('完了','取消済') then
 update public.gf_actual_history_test set state=p_next,cancelled_at=case when p_next='取消済' then now()::text else cancelled_at end where receipt_id=p_receipt;
 if not found then raise exception 'history_missing'; end if;
 end if;
 return true;
end $$;
revoke all on function public.gf_actual_transition_test(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gf_actual_transition_test(text,text,text,text) to service_role;