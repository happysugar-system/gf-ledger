alter table public.gf3_document_receipts_test alter column new_url drop not null, alter column drive_file_id drop not null;
alter table public.gf3_document_receipts_test add constraint gf3_document_file_pair check ((new_url is null)=(drive_file_id is null)), add constraint gf3_document_completed_file check (state not in ('完了','取消中','取消済') or new_url is not null);
create function public.gf3_document_attach_test(p_id text,p_file text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_file is null or p_file !~ '^[A-Za-z0-9_-]+$' then raise exception 'invalid_file'; end if;
 update public.gf3_document_receipts_test set drive_file_id=p_file,new_url='https://drive.google.com/file/d/'||p_file||'/view' where receipt_id=p_id and state='保存中' and (drive_file_id is null or drive_file_id=p_file);
 return found;
end; $$;
revoke all on function public.gf3_document_attach_test(text,text) from public,anon,authenticated;
grant execute on function public.gf3_document_attach_test(text,text) to service_role;