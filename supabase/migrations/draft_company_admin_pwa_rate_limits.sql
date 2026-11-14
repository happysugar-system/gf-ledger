-- Draft only. Apply in isolated validation project after review.
-- Server-only fixed-window throttle: maximum 5 attempts per identity/IP per 5 minutes.
create table if not exists public.gf_company_admin_auth_rate_limits (
  scope_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.gf_company_admin_auth_rate_limits enable row level security;
revoke all on public.gf_company_admin_auth_rate_limits from public, anon, authenticated;
create or replace function public.gf_company_admin_auth_allow(p_scope_hash text, p_limit integer default 5)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_scope_hash is null or length(p_scope_hash) <> 64 or p_limit < 1 or p_limit > 20 then return false; end if;
  insert into public.gf_company_admin_auth_rate_limits(scope_hash,window_start,attempts)
  values (p_scope_hash,now(),1)
  on conflict(scope_hash) do update
  set attempts=case when gf_company_admin_auth_rate_limits.window_start < now()-interval '5 minutes' then 1 else gf_company_admin_auth_rate_limits.attempts+1 end,
      window_start=case when gf_company_admin_auth_rate_limits.window_start < now()-interval '5 minutes' then now() else gf_company_admin_auth_rate_limits.window_start end
  returning attempts into v_count;
  return v_count<=p_limit;
end $$;
revoke all on function public.gf_company_admin_auth_allow(text,integer) from public,anon,authenticated;
grant execute on function public.gf_company_admin_auth_allow(text,integer) to service_role;
-- Scheduled cleanup for expired rows and pairing attempts is required before production.
