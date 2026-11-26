create function public.gf_actual_prepare_test(p_queue jsonb,p_history jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.gf_actual_queue_test; h public.gf_actual_history_test; existing public.gf_actual_history_test;
begin
 q:=jsonb_populate_record(null::public.gf_actual_queue_test,p_queue);
 h:=jsonb_populate_record(null::public.gf_actual_history_test,p_history);
 if q.receipt_id is distinct from 'TEST-RETURN-R005' or h.receipt_id is distinct from q.receipt_id or q.vehicle_id is distinct from 'V900005' or h.vehicle_id is distinct from q.vehicle_id or q.kind is distinct from '返却完了' or h.kind is distinct from q.kind or h.actual_date is distinct from q.actual_date or q.state is distinct from '待機' or h.state is distinct from '処理中' then raise exception 'invalid_test_payload'; end if;
 insert into public.gf_actual_queue_test select (q).* on conflict(receipt_id) do nothing;
 select * into q from public.gf_actual_queue_test where receipt_id=h.receipt_id for update;
 if q.state not in ('待機','処理中') or q.vehicle_id<>h.vehicle_id or q.kind<>h.kind or q.actual_date<>h.actual_date then raise exception 'queue_conflict'; end if;
 insert into public.gf_actual_history_test select (h).* on conflict(receipt_id) do nothing;
 select * into existing from public.gf_actual_history_test where receipt_id=h.receipt_id;
 if existing.before_data is distinct from h.before_data or existing.after_data is distinct from h.after_data or existing.state is distinct from '処理中' then raise exception 'history_conflict'; end if;
 update public.gf_actual_queue_test set state='処理中' where receipt_id=h.receipt_id;
 return true;
end $$;
revoke all on function public.gf_actual_prepare_test(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gf_actual_prepare_test(jsonb,jsonb) to service_role;