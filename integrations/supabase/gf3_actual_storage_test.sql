begin;
create table public.gf3_actual_receipts_test (
 receipt_id text primary key check(receipt_id ~ '^TEST-GF3-[A-Z0-9-]{1,70}$'),
 vehicle_id text not null check(vehicle_id='V900005'),
 driver_id text not null check(driver_id='D999902'),
 application_id text not null check(application_id='2'),
 kind text not null check(kind in ('納車完了','返却完了')),
 actual_date date not null,
 state text not null default '待機' check(state in ('待機','処理中','完了','取消処理中','取消済','要確認')),
 before_data jsonb not null check(jsonb_typeof(before_data)='object'),
 after_data jsonb not null check(jsonb_typeof(after_data)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index gf3_actual_pending_vehicle on public.gf3_actual_receipts_test(vehicle_id)
 where state in ('待機','処理中','取消処理中','要確認');
alter table public.gf3_actual_receipts_test enable row level security;
revoke all on public.gf3_actual_receipts_test from public,anon,authenticated;
grant select,insert on public.gf3_actual_receipts_test to service_role;
create function public.gf3_actual_transition_test(p_id text,p_from text,p_to text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v text; n integer;
begin
 if not ((p_from='待機' and p_to='処理中') or
 (p_from='処理中' and p_to in ('完了','要確認')) or
 (p_from='完了' and p_to='取消処理中') or
 (p_from='取消処理中' and p_to in ('取消済','要確認'))) then
 raise exception 'invalid transition'; end if;
 select vehicle_id into v from public.gf3_actual_receipts_test where receipt_id=p_id;
 if v is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext('gf3_actual:'||v));
 if p_to='取消処理中' and exists(
 select 1 from public.gf3_actual_receipts_test newer
 join public.gf3_actual_receipts_test old on old.receipt_id=p_id
 where newer.vehicle_id=v and newer.receipt_id<>p_id
 and newer.created_at>=old.created_at and newer.state<>'取消済'
 ) then return false; end if;
 update public.gf3_actual_receipts_test set state=p_to,updated_at=now()
 where receipt_id=p_id and state=p_from;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.gf3_actual_transition_test(text,text,text) from public,anon,authenticated;
grant execute on function public.gf3_actual_transition_test(text,text,text) to service_role;
commit;
