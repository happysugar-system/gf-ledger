# GOLD FIRST read-only code inventory — 2026-11-13

Scope: GitHub default-branch source review only. No live endpoint calls, no GAS deployment changes, no spreadsheet edits.

## Confirmed source observations

| Repository | File | Observed integration | Action |
| --- | --- | --- | --- |
| gf-ledger | vehicle-request.html | LIFF SDK and LIFF initialization, ID token handling; several distinct Google Apps Script web-app URL constants (LINE verification, test and submission) | Trace actual call sites and active production/demo deployment ownership before changing |
| gf-mypage-demo | index.html | Supabase JS v2 auth client and client-side RLS assumption | Verify policies and server-side authorization separately |
| gf-mypage-demo | mypage-line-preview.html | Supabase auth, authenticated Edge Function call for LINE account linking, link to gf-ledger preview page | Verify challenge expiry, one-time use and server validation |

## Important distinctions
- URLs in source establish *configured candidates*, not which endpoint is actively deployed or used in production.
- Public Supabase publishable keys are not equivalent to secret service-role keys; do not expose any privileged key or client records.
- GF219's 7/7 simulated tests are not real GF215/GF218 integration tests.
- Existing operational Google Sheets remain unchanged and are not replaced by the migration.

## Proposed source organization (no implementation yet)
- `apps/vehicle-request/` — vehicle application UI
- `apps/driver-portal/` — driver portal UI (separate repo until migration approved)
- `packages/contracts/` — validated API request/response schemas
- `supabase/functions/` — authenticated server operations (only after deployment mapping)
- `gas/legacy-bridges/` — minimum necessary Google integrations, private source storage
- `tests/` — fixture-only automated tests, no production credentials
- `docs/integrations/` — ownership map, deployment inventory, rollback plan

## Read-only follow-up checklist
1. Trace call sites for all GAS endpoint constants in `vehicle-request.html`.
2. Verify which LIFF/LINE Official Account each path belongs to; keep demo and production separate.
3. Map source of truth for each spreadsheet column and Supabase table.
4. Inspect RLS and Edge Function auth with read-only access, without exposing credentials.
5. Create an isolated automated test suite and compare it with actual GAS behavior before replacing any endpoint.
6. Request explicit approval before modifying live apps, webhooks, credentials, or sheet writes.

## Security note
Both inspected repositories are public. Never commit GAS script properties, ID tokens, personal data, private document links, or privileged Supabase credentials.
