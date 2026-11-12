-- TEST-ONLY isolated fast intake. NOT APPLIED.
-- Existing GF145/146, existing jobs, documents and buckets are unchanged.
create table if not exists public.gf_fast_upload_sessions_test (
  id uuid primary key default gen_random_uuid(),
  request_key_hash text not null unique check (request_key_hash ~ '^[0-9a-f]{64}$'),
  gas_receipt text not null unique check (gas_receipt ~ '^TEST145-[0-9]{14}-[0-9a-f]{8}$'),
  nonce text not null unique,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  resident_method text not null check (resident_method in ('upload','mail')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.gf_fast_upload_documents_test (
  session_id uuid not null references public.gf_fast_upload_sessions_test(id),
  document_type text not null check (document_type in ('license_front','license_back','resident_pdf')),
  object_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 100 and 4194304),
  created_at timestamptz not null default now(),
  primary key(session_id, document_type)
);
alter table public.gf_fast_upload_sessions_test enable row level security;
alter table public.gf_fast_upload_documents_test enable row level security;
revoke all on public.gf_fast_upload_sessions_test from anon, authenticated;
revoke all on public.gf_fast_upload_documents_test from anon, authenticated;
-- Edge Function accesses these tables only with server-side service_role.
-- Store uploaded files in EXISTING private bucket gf-secure-intake-staging,
-- using fast-test/<session uuid>/<document type> object paths.
