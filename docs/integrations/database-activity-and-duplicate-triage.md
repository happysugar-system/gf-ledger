# GOLD FIRST activity and duplicate-candidate triage — read-only 2026-11-13

Source: PostgreSQL `pg_stat_user_tables` statistics and `pg_index` definitions in connected Supabase projects. No row-level data or personal information read, no writes. **Counts are estimates**, and scan/update counters reflect cumulative statistics, not proof of current usage.

## Priority observations

| Existing project table | Estimated live rows | Interpretation |
|---|---:|---|
| `gf_driver_match_master` | 168 | Heavily accessed/updated; preserve pending provenance audit |
| `gf_driver_match_master_prod` | 178 | Referenced by canonical LINE linking function; preserve |
| `gf_line_driver_identity_prod` | 0 | Canonical linking function needs a matching row; likely onboarding blocker; verify exact count and data source before action |
| `gf_mypage_links` | 6 | Existing account links; preserve; not proof that LINE flow completed |
| `gf_mypage_applications` | 14 | Preserve pending consumer mapping |
| `gf_mypage_applications_prod` | 22 | Preserve pending consumer mapping |
| `gf_vehicles` | 208 | Preserve pending ownership check |
| `gf_vehicles_test` | 209 | Non-empty, index scans observed; **do not delete merely because of suffix** |
| `gf_fast_upload_documents_test` | 4 | Candidate for future archival only |
| `gf_fast_upload_nonces_test` | 6 | Candidate for future archival only |
| `gf_fast_upload_sessions_test` | 3 | Candidate for future archival only |
| `gf_mypage_line_challenges` | 0 | May indicate unused or expired/cleared challenges; inspect source and lifecycle |

Other estimates: `gf_mypage_admins` 1, `gf_mypage_registration_requests` 8, `gf_portal_notification_counts` 1, `gf_secure_intake_documents` 9, `gf_mypage_contact_change_requests` 0, `gf_mypage_existing_driver_invites` 0, `gf_vehicle_fast_intake_jobs` 0.

Demo project: `gf_demo_applications` 1, `gf_demo_driver_profiles` 1, `gf_demo_enrollment_allowlist` 1, `gf_demo_line_challenges` 3, `gf_demo_line_identities` 1, `gf_demo_mypage_links` 1. These are **not automatically safe to discard**.

## Verified uniqueness constraints

- Canonical `gf_line_driver_identity_prod`: unique `line_user_id`, `driver_id`, `source_key`.
- Canonical `gf_mypage_links`: unique auth user and driver IDs, with some overlapping unique indexes to review later.
- Canonical `gf_mypage_line_challenges`: unique `token_hash`.
- Both `gf_vehicles` and `gf_vehicles_test`: unique vehicle IDs and vehicle numbers **within each table**, not across tables.

## Required before cleanup or consolidation

1. Read-only verify exact counts for identity mapping and compare vehicle keys across the two tables **without selecting driver PII**.
2. Trace which Edge Functions and pages reference each table, and identify authoritative data sources and sync directions.
3. Inspect RLS policy predicates and database grants for authenticated portal flows.
4. Check backup/restore and data retention; then write explicit archive and rollback plan.
5. No deletion, migration, endpoint changes, or production identity registration until verified and separately approved.
