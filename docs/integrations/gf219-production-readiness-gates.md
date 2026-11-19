# GF215/GF218/GF219: acceptance gates before any live LINE rollout

Status: **READ-ONLY REVIEW — NOT PRODUCTION READY**. Compiled from prior GF219 user-provided isolated-test output and GitHub vehicle-request.html call-site trace. This document does not assert that the live GAS source has been fetched or executed.

## Previously reported isolated GF219 result (7/7 OK)

| # | Scenario | Isolated GF219 result | Required real integration verification |
|---|---|---|---|
| 1 | First submission writes one record to each of the two sheets | OK | Compare actual rows/IDs, timestamps, and column mappings in disposable test spreadsheet |
| 2 | Identical replay returns same receipt without duplicate | OK | Retry same signed request through real GF215/GF218 handler |
| 3 | Replay from another LINE user is rejected | OK | Server-verified LINE identity; cannot rely on browser-provided user ID |
| 4 | Simulated failure leaves only LINE reception row | OK | Inject controlled failure after first real sheet write |
| 5 | Other LINE user cannot repair orphan | OK | Server authorization during real repair path |
| 6 | Same user repairs orphan without new LINE reception | OK | Real handler idempotent repair, same receipt |
| 7 | Replay after repair still has no duplicates | OK | Verify both sheets after repeated retries |

GF219 output also stated: `productionWrites:false`, `testSpreadsheetTrashed:true`, `readyForProduction:false`. Real GF215/GF218 integration, Drive save and webhook signature verification **were not performed**.

## Additional non-negotiable gates

- **Signature:** verify LINE webhook HMAC signature against raw body using the channel secret on the server; fail closed for invalid signature. Do not expose secret in GitHub/public HTML.
- **Identity:** bind a verified LINE identity to each intake; a submitted `gf_entry` token alone is not proof of user identity. Check expiry, one-time semantics and replay policy on the server.
- **Atomicity/recovery:** Google Sheets does not provide a multi-sheet database transaction. Use stable idempotency key and explicit recovery state; avoid two receipts for one application.
- **Documents:** test Drive permissions, folder ownership, upload failures, retry, and no publicly exposed personal documents. Never use actual driver data in tests.
- **Mapping:** verify the 14-column `LINE受付管理` and 22-column `車両依頼受付` layouts against current spreadsheet, not just historical specifications.
- **Flags:** GF215/GF216 write switches stay OFF until controlled integration tests pass. Never set owner secret or folder IDs based on guesses.
- **Backout:** retain existing LINE menus, webhook, GAS deployments, spreadsheet and Drive behavior until a separately approved release plan is tested.

## Current evidence vs missing evidence

**Verified in GitHub:** `vehicle-request.html` currently posts `action=gf_vehicle_submit_test` to `GF_VEHICLE_SUBMIT_URL` and checks `gf_entry` using `action=gf_vehicle_entry_check`. A read-only GitHub Actions test passed on PR #4.

**Not verified:** current deployed GAS handlers and script properties, real write destination, live LINE webhook mapping, actual GF215/GF218 execution, server-side token/signature checks, Drive persistence, or Supabase integration behavior.

## Safe next technical step

Obtain a **read-only export** of the relevant GAS server handlers and their manifest (without secrets), compare entry and submit handlers to the expected sheet mapping, then create test doubles for Sheets/Drive/LINE and integration tests that do not call live endpoints. Do not switch the frontend endpoint until those tests pass and the user approves rollout.
