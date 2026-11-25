create table public.gf_reception_access (
 email text primary key check (email=lower(btrim(email)) and length(email) between 3 and 254),
 role text not null check (role in ('owner','staff')),
 enabled boolean not null default false,
 staff_name text
);
alter table public.gf_reception_access enable row level security;
revoke all on public.gf_reception_access from public, anon, authenticated;
grant select on public.gf_reception_access to service_role;
