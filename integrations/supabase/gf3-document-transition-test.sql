create function public.gf3_document_transition_test(p_id text,p_expected text,p_next text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not ((p_expected='待機' and p_next='保存中') or (p_expected='保存中' and p_next in ('完了','要確認')) or (p_expected='完了' and p_next='取消中') or (p_expected='取消中' and p_next in ('取消済','要確認'))) then raise exception 'invalid_transition'; end if;
 update public.gf3_document_receipts_test set state=p_next,cancelled_at=case when p_next='取消済' then now() else null end where receipt_id=p_id and state=p_expected;
 return found;
end; $$;
revoke all on function public.gf3_document_transition_test(text,text,text) from public,anon,authenticated;
grant execute on function public.gf3_document_transition_test(text,text,text) to service_role;