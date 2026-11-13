# GOLD FIRST architecture migration plan (draft)

Status: planning only. No production deployment or data changes.

## Current systems
- GitHub `gf-ledger`: existing HTML pages including vehicle request, staff pages and related demos.
- GitHub `gf-mypage-demo`: driver portal and identity/document demos, maintained separately.
- GAS production project “GOLD FIRST 整理”: LINE FAQ (100), disabled placeholder (213), read-only diagnostics (214/217/218/219), gated receipt/document handlers (215/216).
- Other GAS projects: demo LINE reception, demo receiver, and vehicle/driver ledger. Do not mix their deployments or secrets.
- Existing Google Sheets remain the operational interface and must not be replaced or restructured without an approved migration plan.

## Proposed boundaries
1. GitHub: source code, code review, tests, documentation. Never store customer records or secrets in a public repository.
2. Supabase: authenticated API, database, identity, and server-side processing where appropriate. Use RLS and scoped service credentials.
3. Google Sheets: preserve existing ledger and reception tabs, names, columns, formulas, and staff workflows. Define one authoritative owner per field and a monitored synchronization process.
4. GAS: retain only integrations that require Apps Script/Google services until verified replacement exists; keep production LINE FAQ unchanged.
5. Drive: private document storage; avoid publicly accessible URLs for identity documents.

## Migration gates
- Inventory all deployed GAS projects and entrypoints, including triggers and web app deployment IDs (do not publish credentials).
- Map current data flows, spreadsheet schema, and source of truth.
- Establish isolated test fixtures and automated unit tests; GF219 was a simulation, not a GF215/GF218 integration test.
- Test idempotency, cross-sheet partial failures, file retry/cleanup, LINE signature validation, authorization and permission boundaries.
- Validate rollback and backup, then request explicit approval before any production deployment, permission changes, or write enablement.

## Current safety constraints
- Keep `GF215_WRITE_ENABLED` and `GF216_WRITE_ENABLED` disabled.
- Do not modify production spreadsheets, LINE settings, webhook, or existing deployments.
- Do not move GAS source to a public repository until secrets and personal data have been audited and removed.
- No assumption that a GitHub commit deploys Apps Script; clasp or an authorized CI integration must be separately established and tested.

## Next review
Read-only inventory of GitHub pages and deployed GAS source, then propose a modular repository structure and a testable migration plan before changing application behavior.
