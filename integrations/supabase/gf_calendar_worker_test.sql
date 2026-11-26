create or replace function public.gf_calendar_claim_test()
returns setof public.gf_calendar_jobs_test language sql security invoker set search_path='' as $$
 update public.gf_calendar_jobs_test j set state='processing',attempts=j.attempts+1,updated_at=now()
 where j.job_id=(select q.job_id from public.gf_calendar_jobs_test q join public.gf_calendar_routes_test r on r.route_key=q.route_key where q.state in ('waiting','retry') and q.attempts<3 and q.next_attempt_at<=now() and r.enabled order by q.next_attempt_at,q.job_id limit 1 for update of q skip locked)
 returning j.*;
$$;
create or replace function public.gf_calendar_finish_test(p_id text,p_attempt integer,p_outcome text,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome not in ('completed','retry','review') then raise exception 'invalid_outcome'; end if;
 update public.gf_calendar_jobs_test set state=case when p_outcome='retry' and attempts>=3 then 'review' else p_outcome end, last_error=left(p_error,500),next_attempt_at=now()+interval '5 minutes',updated_at=now()
 where job_id=p_id and state='processing' and attempts=p_attempt;
 return found;
end;
$$;
revoke all on function public.gf_calendar_claim_test() from public,anon,authenticated;
revoke all on function public.gf_calendar_finish_test(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gf_calendar_claim_test() to service_role;
grant execute on function public.gf_calendar_finish_test(text,integer,text,text) to service_role;