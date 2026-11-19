# Admin-approved LINE ↔ DriverID linking design (proposal only)

Date: 2026-11-13. No production code, DB rows, LINE settings, GAS deployment, or permissions changed.

## Goal
Use the existing `gf_line_driver_identity_prod` as the **single canonical mapping** from a verified LINE account to a canonical DriverID. Avoid another identity master and preserve existing intake, six `gf_mypage_links`, and vehicle records.

## Verified existing schema
- `gf_line_driver_identity_prod`: non-null `line_user_id`, `driver_id`, `receipt_id`, `line_reception_id`, `source_key`, `synced_at`; unique LINE user, DriverID and source key (from earlier index audit).
- `gf_driver_match_master_prod`: `driver_id`, `full_name`, `name_key`, `phone_number`, `driver_status`, `synced_at`, `email`.
- `gf_mypage_registration_requests`: `auth_user_id`, `status`, `created_at`, `reviewed_at`, `full_name`, `phone_number`.
- `gf_mypage_links`: `auth_user_id`, `driver_id`, `email`.
- Shared GF215 GAS saves LINE ID and receipt references to LINE intake Sheet but intentionally leaves DriverID blank and request status `未照合（管理者確認）`. The 100_LINE受付.gs GAS bridge retains LINE ID via server-side opaque token. GF215 write switch initially OFF and not webhook-connected.
- `gf_line_driver_identity_prod` exact current count 0, `gf_mypage_links` 6.

## Proposed approval workflow

1. **Intake:** Receive LINE event-derived LINE ID via existing server-side `gf_entry` bridge; preserve receipt and LINE reception IDs; treat any browser-supplied identity as untrusted.
2. **Candidate lookup (read-only):** Admin sees request details and potential canonical DriverID(s), but no automatic approval based solely on matching name, phone, or email. If zero or multiple candidates, leave pending. The UI must not expose other drivers to applicants.
3. **Identity verification:** Authorized staff reviews supporting evidence and confirms the LINE account holder is the intended driver; explicitly selects the DriverID. Capture reviewer, method, time and provenance in a restricted audit record (not public GitHub, not an unauthenticated client table).
4. **Pre-write validation:** Check canonical DriverID exists and is eligible, authenticated admin role, confirmed LINE provenance, verified receipt/LINE reception IDs and ownership, duplicate LINE/DriverID/source keys, and existing `gf_mypage_links` conflicts. Fail closed on conflict.
5. **Atomic approval:** Use a privileged server-side function/transaction to insert mapping into existing `gf_line_driver_identity_prod` and record approval audit, with idempotency for the same source request. Do not overwrite an existing conflicting mapping. Avoid partial writes across GAS Sheet and Supabase; use an outbox/retry or reconciliation status.
6. **Portal linking:** Existing `gf-line-mypage-link` / `gf_link_mypage_from_verified_line` resolves verified LINE ID through mapping, then applies its own confirmed auth and registration checks before creating a portal link. Approval of mapping must **not** bypass portal auth/registration rules.
7. **Reconciliation:** After success, reflect verified DriverID/status back to the intake Sheet using receipt ID; if Sheet sync fails, keep a retryable status and do not create a second mapping.

## UI proposal
A single administrator review queue: `未照合` → `本人確認中` → `承認済み` or `差戻し` / `競合・要確認`. Show receipt, candidate DriverID, evidence checklist, duplicate warnings, and approve/reject actions. Require confirmation for approval. Never include raw LINE IDs or documents in logs or public repository.

## Non-negotiable safety gates
- Only authorized admin server action can approve; no direct browser/client INSERT into mapping.
- Proven LINE user ID origin and verified LINE channel identity; do not equate an arbitrary form ID with a verified LINE account.
- No new identity master, no deletion or mass migration, no changing existing production LINE menus/webhooks.
- Test synthetic successful, duplicate replay, mismatched LINE owner, conflicting DriverID, stale token, unauthorized staff, retry after partial Sheet failure, and existing portal link cases before live writes.
- Revalidate real deployed GAS receiver, GF115, Supabase RLS and function privileges, and current operational owner before implementation.

## Next implementation sequence
1. Build a read-only admin review queue and conflict diagnostics using existing tables, with restricted authentication and no public PII.
2. Implement a privileged idempotent approval transaction in a migration **on an isolated test project first**; no production deployment until explicit approval.
3. Connect approved mapping to existing portal flow; test end-to-end with synthetic records.
4. Present diff, tests, rollback plan and exact deployment checklist for user sign-off.
