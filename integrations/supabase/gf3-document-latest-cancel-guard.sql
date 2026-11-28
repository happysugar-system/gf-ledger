create or replace function public.gf3_document_transition_test(p_id text,p_expected text,p_next text) returns boolean language plpgsql security invoker set search_path='' as $$
declare v text; t timestamptz;
begin
 if p_expected is null or p_next is null or not ((p_expected='待機' and p_next='保存中') or (p_expected='保存中' and p_next in ('完了','要確認')) or (p_expected='完了' and p_next='取消中') or (p_expected='取消中' and p_next in ('取消済','要確認'))) then raise exception 'invalid_transition'; end if;
 select vehicle_id,created_at into v,t from public.gf3_document_receipts_test where receipt_id=p_id;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('gf3-document:'||v,0));
 if p_next='取消中' and exists(select 1 from public.gf3_document_receipts_test where vehicle_id=v and receipt_id<>p_id and created_at>=t and state<>'取消済') then return false; end if;
 update public.gf3_document_receipts_test set state=p_next,cancelled_at=case when p_next='取消済' then now() else null end where receipt_id=p_id and state=p_expected;
 return found;
end; $$;
revoke all on function public.gf3_document_transition_test(text,text,text) from public,anon,authenticated;
grant execute on function public.gf3_document_transition_test(text,text,text) to service_role;