-- GOLD FIRST 法人ポータル: isolated, read-only tenant model.
-- REVIEW BEFORE APPLYING. Does not change gf_vehicles or existing policies.
create table if not exists public.gf_company_portal_companies (
 id uuid primary key default gen_random_uuid(),
 company_name text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.gf_company_portal_members (
 company_id uuid not null references public.gf_company_portal_companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 active boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(company_id,user_id)
);
-- A curated read-only projection, not the raw vehicle_data JSON (contains private fields).
-- Server-side sync must populate company_id using a verified, explicit mapping.
create table if not exists public.gf_company_portal_vehicles (
 company_id uuid not null references public.gf_company_portal_companies(id) on delete cascade,
 vehicle_id text not null,
 vehicle_number text,
 driver_display_name text,
 status text,
 name_change_scheduled text,
 delivery_scheduled text,
 usage_start text,
 return_scheduled text,
 updated_at timestamptz,
 primary key(company_id,vehicle_id)
);
alter table public.gf_company_portal_companies enable row level security;
alter table public.gf_company_portal_members enable row level security;
alter table public.gf_company_portal_vehicles enable row level security;
revoke all on public.gf_company_portal_companies from anon;
revoke all on public.gf_company_portal_members from anon;
revoke all on public.gf_company_portal_vehicles from anon;
grant select on public.gf_company_portal_companies, public.gf_company_portal_members, public.gf_company_portal_vehicles to authenticated;
create policy "company member sees own membership" on public.gf_company_portal_members
 for select to authenticated using (user_id = (select auth.uid()) and active);
create policy "company member sees own company" on public.gf_company_portal_companies
 for select to authenticated using (
 exists(select 1 from public.gf_company_portal_members m where m.company_id=id and m.user_id=(select auth.uid()) and m.active)
 );
create policy "company member sees assigned vehicles" on public.gf_company_portal_vehicles
 for select to authenticated using (
 exists(select 1 from public.gf_company_portal_members m where m.company_id=gf_company_portal_vehicles.company_id and m.user_id=(select auth.uid()) and m.active)
 );
-- No INSERT/UPDATE/DELETE grants to client roles. Provision and sync using trusted backend only.
-- No company selection supplied by the browser can expand the allowed rows.
