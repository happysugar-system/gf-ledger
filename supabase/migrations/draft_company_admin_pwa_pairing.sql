-- Draft migration. Do not apply to production until reviewed.
create table if not exists public.gf_company_admin_pairings (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  verifier_hash text not null unique,
  line_user_id text,
  status text not null default 'pending' check (status in ('pending','approved','consumed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);
create index if not exists gf_company_admin_pairings_expiry on public.gf_company_admin_pairings(expires_at);
create table if not exists public.gf_company_admin_device_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  line_user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz
);
create index if not exists gf_company_admin_device_sessions_user on public.gf_company_admin_device_sessions(line_user_id);
alter table public.gf_company_admin_pairings enable row level security;
alter table public.gf_company_admin_device_sessions enable row level security;
revoke all on public.gf_company_admin_pairings from anon, authenticated;
revoke all on public.gf_company_admin_device_sessions from anon, authenticated;
-- No client-side policies: only server service role can access these tables.
