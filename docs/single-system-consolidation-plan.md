# GOLD FIRST: single-system consolidation decision (2026-11-13)

## Decision
One **canonical production system** with one primary GitHub source of truth and one primary Supabase project; preserve Google Sheets as the operational ledger interface, LINE official accounts as channels, and Drive as document storage. Demo/test environments are temporary validation tools, not additional products or permanent sources of truth. **No automatic deletion, merge, or endpoint switch.**

## Current evidence
- `gf-mypage-demo/index.html` and `mypage-line-preview.html` currently target Supabase ref `tgxrnrqxafytyqfwwsag` (project display name `goldfirst-tokyo-test`), not the newer `goldfirst-demo` ref `zwprphmfgobkektzsuti`.
- `gf-line-mypage-link` on the former verifies email login and LINE ID token, then calls `gf_complete_line_mypage_challenge` RPC; challenge table `gf_mypage_line_challenges`. Source hardcodes LINE Login channel ID `2012019621` and allowed GitHub Pages origin.
- `gf-demo-line-mypage-link` on the latter implements similar verification but reads demo channel ID from `GF_DEMO_LINE_LOGIN_CHANNEL_ID`, uses `gf_demo_line_challenges` and `gf_demo_complete_line_challenge` RPC. **These functions are not interchangeable without migrating identity mappings and policies.**
- Both functions report `verify_jwt:false`; both perform their own checks for the `begin` action and verify LINE tokens for `complete`. A security review of the RPC definitions, challenge authorization and account mapping is still required.
- `gf-ledger/vehicle-request.html` submits to GAS, not to either Supabase project. GAS handler source and deployment ownership have not been verified.

## Proposed canonical targets (pending verified inventory)
- Primary code repository: **provisionally `happysugar-system/gf-ledger`**, organizing subdirectories for admin, driver portal, LINE intake, integrations, and tests. Do not move `gf-mypage-demo` until links and deployment are inventoried.
- Primary Supabase: **provisionally existing `tgxrnrqxafytyqfwwsag`** because the current driver portal already uses it. Its display name can be clarified later, without changing project ref. This is a proposal, not a claim that the project is production-safe.
- One LINE intake/identity design with explicit staging fixtures and feature flags. Never reuse demo identities for live drivers without verified consent and matching.
- Existing Google Sheets remain the human-facing ledgers; designate a per-entity authoritative source and sync direction to avoid bidirectional overwrites.

## Non-destructive migration stages
1. **Inventory and freeze:** catalog each GitHub page, deployed URL, LINE menu/LIFF, GAS handler, Supabase table/function/RLS, Sheet and Drive folder; tag active/legacy/unknown. Do not alter current connections.
2. **Backup and ownership:** verify recoverable exports and repository history; obtain server-side GAS source and exact active deployment; record rollback steps privately without secrets.
3. **Unify source code:** bring reusable portal and intake code under one GitHub repository on a feature branch; keep existing live pages unchanged. Add contract tests.
4. **Unify identity and data:** choose canonical Supabase after checking auth users, LINE identity mappings, RLS and actual table data. Build reversible migration scripts and verify counts/checksums with synthetic test records.
5. **Parallel verification:** test one controlled synthetic driver end-to-end (LINE → identity → intake → Sheets → Drive → mypage), including duplicate replay and failure recovery.
6. **Controlled cutover:** with user approval, switch one route at a time, monitor, retain old route for rollback.
7. **Retire extras:** only after acceptance and retention review, archive demo/test assets; deletion requires separate explicit approval.

## Do not do now
- Do not delete `goldfirst-demo`, `gf-mypage-demo`, GAS deployments or any Sheets.
- Do not rename project refs, replace LIFF IDs, change LINE Webhooks, alter RLS, or switch Edge Function endpoints without integration evidence.
- Do not put driver documents, LINE secrets, service-role keys, or customer records in public GitHub.

## Immediate next work
Read-only inspect the two Edge Function sources (completed), then inspect the RPC definitions and table permissions before implementing any unified identity module. Confirm the deployed GAS handler for vehicle submission independently. Current production readiness: **not established**.
