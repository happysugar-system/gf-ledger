-- Applied to GOLD FIRST Supabase test-only tables on 2026-11-13.
create table if not exists public.gf_fast_upload_nonces_test (
 nonce text primary key check (nonce ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 created_at timestamptz not null default now()
);
alter table public.gf_fast_upload_nonces_test enable row level security;
revoke all on public.gf_fast_upload_nonces_test from anon, authenticated;
comment on table public.gf_fast_upload_nonces_test is 'Test-only signed GAS request replay prevention. Keep nonce records at least as long as signing secret validity.';
