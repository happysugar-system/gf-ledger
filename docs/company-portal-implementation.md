# GOLD FIRST 法人マイページ — implementation v1

Status: **development branch only; not deployed**. Existing LINE, GAS, driver MyPage, gf_vehicles and Supabase RLS unchanged.

## Purpose (10/26 meeting)
UP's / カメレオンなどの所属・管理会社が、自社の対象車両の準備・名変・納車・利用開始・返却状況を閲覧し、日付の認識違いを減らす。最初は閲覧専用。会社切替は設けない。

## Tenant isolation
- Supabase Auth user -> active membership -> company UUID -> curated vehicle projection.
- All three new tables have RLS. Authenticated client can SELECT only authorized tenant rows.
- Never trust company name, company ID, LINE ID or email passed from the browser to grant access.
- Membership provisioning is server/admin-only after company authorization; new accounts default inactive.
- Server sync must resolve each vehicle to an explicit, reviewed company mapping. Do not infer entitlement solely from a free-text 所属会社名; distinguish 所属会社 and 管理会社 permissions after confirming with GOLD FIRST.
- Do not expose the raw gf_vehicles.vehicle_data to tenant clients: it contains sensitive contact, pricing and other information.
- RLS and negative cross-company tests required before release. No production data writes or notifications in this version.

## Existing source
public.gf_vehicles(vehicle_id,vehicle_number,vehicle_data jsonb,updated_at)
Relevant JSON keys include 所属会社名, 管理区分, 区分/ステータス, 名変予定日, 名義変更日, 納車予定日, 引渡し, 返却予定日, 現在使用者.
Map dates and business status after checking actual value patterns. Keep history and notification panels explicitly '準備中' until event records exist.

## Activation checklist
1. Confirm company entity list and which vehicles each company may view, including subcontractor/management relationships.
2. Review migration SQL at sql/company-portal-tenant-rls.sql; apply to an isolated test project first.
3. Provision separate test Auth users for UP's and カメレオン, and explicit memberships.
4. Populate curated test rows through trusted server; verify both users cannot read each other's company/vehicle data, including direct REST requests and forged company IDs.
5. Wire UI to authenticated Supabase client and remove demo records. Validate empty/loading/error states.
6. Only then plan production deployment and LINE entrypoint; do not modify existing 7-button menu until approved.
