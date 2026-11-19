# GOLD FIRST database table and access inventory (read-only 2026-11-13)

Queried PostgreSQL catalogs and information_schema only. **No application rows or personal data read; no changes performed.**

## Existing mypage project `tgxrnrqxafytyqfwwsag`

19 `public.gf_*` base tables, all with RLS enabled:

| Category | Tables | Disposition |
|---|---|---|
| Core identity | `gf_line_driver_identity_prod`, `gf_driver_match_master_prod`, `gf_mypage_links`, `gf_mypage_line_challenges` | **Retain pending lineage/constraints audit** |
| Portal and registration | `gf_mypage_admins`, `gf_mypage_applications`, `gf_mypage_applications_prod`, `gf_mypage_registration_requests`, `gf_mypage_contact_change_requests`, `gf_mypage_existing_driver_invites`, `gf_portal_notification_counts`, `gf_driver_match_master` | **Retain pending usage audit**; possible duplicate semantics are not proof of redundancy |
| Vehicles | `gf_vehicles`, `gf_vehicles_test` | **Review**, never delete based on suffix |
| Intake / documents | `gf_secure_intake_documents`, `gf_vehicle_fast_intake_jobs` | **Review** against GAS/Drive and current functions |
| Test upload | `gf_fast_upload_documents_test`, `gf_fast_upload_nonces_test`, `gf_fast_upload_sessions_test` | **Archive candidates only after verifying references, data retention and backup** |

## Isolated demo project `zwprphmfgobkektzsuti`

6 `public.gf_demo_*` base tables, all with RLS enabled:
`gf_demo_applications`, `gf_demo_driver_profiles`, `gf_demo_enrollment_allowlist`, `gf_demo_line_challenges`, `gf_demo_line_identities`, `gf_demo_mypage_links`.

All six are **eventual archive candidates** after comparing functionality, test coverage, references and retention requirements. Do not merge demo identity data into production blindly.

## Verified privilege findings

- No `anon` SELECT or INSERT privilege on the inspected GF tables in either project.
- Existing project: `authenticated` SELECT is granted for a limited set of portal-facing tables, such as `gf_mypage_links`, `gf_mypage_registration_requests`, `gf_mypage_applications`, and `gf_mypage_admins`. Their RLS policies must still be audited for ownership enforcement.
- Existing project: `authenticated` INSERT is granted on `gf_mypage_registration_requests` and `gf_mypage_contact_change_requests`; verify WITH CHECK predicates.
- Existing project: identity mapping tables `gf_line_driver_identity_prod`, `gf_driver_match_master_prod`, and challenge table `gf_mypage_line_challenges` have no direct SELECT/INSERT grants to `anon` or `authenticated`.
- Demo project: no `authenticated` SELECT/INSERT grants on the six demo GF tables; `gf_demo_applications` has a named RLS policy, but lack of grants still blocks direct table access. Server-side privileged functions may access tables separately.

## Unverified, not yet safe to retire

- RLS policy expressions (USING/WITH CHECK), UPDATE/DELETE privileges, views and function calls.
- Unique constraints, foreign keys, active row counts, triggers and active integrations.
- Whether any table holds operationally required data or is referenced by a currently deployed Edge Function or GAS.
- Whether test-labeled tables contain real data, and whether retention/backups are complete.

## Consolidation rule

Keep a single canonical application architecture and project target, but classify assets by **observed dependencies and safe cutover tests**, not names such as `demo`, `test`, or `prod`. No deletions, schema changes, auth changes, endpoint switches or migrations without approval.
