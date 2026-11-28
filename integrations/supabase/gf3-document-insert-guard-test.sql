create function public.gf3_document_insert_guard_test() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('gf3-document:'||new.vehicle_id,0));
 if new.state <> '待機' then raise exception 'invalid_initial_state'; end if;
 new.created_at := clock_timestamp();
 return new;
end; $$;
revoke all on function public.gf3_document_insert_guard_test() from public,anon,authenticated;
grant execute on function public.gf3_document_insert_guard_test() to service_role;
create trigger gf3_document_insert_guard_test before insert on public.gf3_document_receipts_test for each row execute function public.gf3_document_insert_guard_test();