-- Company portal trusted-server synchronization (draft; do not run against production).
-- IMPORTANT: Only explicit, reviewed exact-name aliases may map a vehicle to a company.
-- Company name in gf_vehicles is untrusted data, never a login authorization claim.
-- This script is designed for a controlled backend job after the base schema is deployed.
create table if not exists public.gf_company_portal_affiliation_aliases (
  source_affiliation text primary key,
  company_id uuid not null references public.gf_company_portal_companies(id),
  reviewed_at timestamptz not null default now(),
  reviewed_by text not null
);
alter table public.gf_company_portal_affiliation_aliases enable row level security;
revoke all on public.gf_company_portal_affiliation_aliases from anon, authenticated;
-- No client policies; admin/service backend only.
-- Do not auto-create aliases from observed source strings.
-- For initial testing, manually review each alias and insert approved mapping.
-- Avoid publishing all gf_vehicles columns: projection uses only allowlisted fields.
-- Example backend upsert statement (run only with trusted privileges, after review):
-- insert into public.gf_company_portal_vehicles
--   (company_id,vehicle_id,vehicle_number,driver_display_name,status,
--    name_change_scheduled,delivery_scheduled,usage_start,return_scheduled,updated_at)
-- select a.company_id,v.vehicle_id,v.vehicle_number,
--        v.vehicle_data->>'現在使用者',
--        coalesce(nullif(v.vehicle_data->>'管理区分',''),v.vehicle_data->>'区分/ステータス'),
--        v.vehicle_data->>'名変予定日',
--        v.vehicle_data->>'納車予定日',
--        v.vehicle_data->>'代車開始日',
--        v.vehicle_data->>'返却予定日',
--        v.updated_at
-- from public.gf_vehicles v
-- join public.gf_company_portal_affiliation_aliases a
--   on btrim(v.vehicle_data->>'所属会社名') = a.source_affiliation
-- on conflict (company_id,vehicle_id) do update set
--   vehicle_number=excluded.vehicle_number,
--   driver_display_name=excluded.driver_display_name,
--   status=excluded.status,
--   name_change_scheduled=excluded.name_change_scheduled,
--   delivery_scheduled=excluded.delivery_scheduled,
--   usage_start=excluded.usage_start,
--   return_scheduled=excluded.return_scheduled,
--   updated_at=excluded.updated_at;
-- A full sync must also REMOVE stale projections when affiliation changes.
-- Never run the example upsert alone as a complete synchronization.
