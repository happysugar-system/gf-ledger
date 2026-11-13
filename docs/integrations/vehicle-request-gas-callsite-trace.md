# Vehicle request: exact GAS call-site trace (read-only, 2026-11-13)

Source: `gf-ledger/vehicle-request.html` on `main`. This is a **source trace**, not a confirmation of live deployment configuration.

## Three configured GAS endpoints

1. `LINE_VERIFY_TEST_URL` (line 686): used by multiple explicit demo/test buttons, with form POST and `id_token` (lines 737–879). Actions include `save_145_form_v1` and `driver_candidate_check_v1`. It is not the main final submission endpoint.
2. `TEST_GAS_WEB_APP_URL` (line 882): declared, but **no other references in this HTML file**. Candidate unused constant; do not delete before cross-project history review.
3. `GF_VEHICLE_SUBMIT_URL` (line 1229): the **main form's configured submission endpoint**. Called via JSONP-like dynamic script tag with `action=gf_vehicle_entry_check` and a 64-character `gf_entry` token (lines 1254–1263). Final submission uses HTML form POST `action=gf_vehicle_submit_test` to this endpoint (lines 1296–1329). Payload includes name/contact/guarantor information, driver's license front/back image data and resident PDF data. This is sensitive personal information; do not add request-body logging or browser telemetry.

## Observed behavior and cautions
- `APP_ENV='DEMO'` (line 734) while main submit action is named `gf_vehicle_submit_test`. These names do **not** prove where the endpoint writes. Confirm GAS handler implementation and active deployment ownership separately.
- LIFF ID is configured in the page (line 684). The LIFF SDK login and `getIDToken()` are used by test flows; the final submission path visible at lines 1296–1329 sends `gf_entry` and document payload, not an `id_token` field. Verify server-side ownership/authentication before production enablement.
- `gf_entry` is validated for 64-character hex shape in the browser. Server-side verification must enforce actual authorization, expiry, and replay rules.
- Main submit sends to an existing GAS web-app endpoint; GitHub edits alone will not migrate the backend or automatically deploy GAS.
- Previous project notes identify the endpoint suffix `POfsrmGO_A` as the demo LINE/GAS path, while production LINE has a different Webhook. Verify exact deployment IDs before any migration.

## Migration plan (no writes)
1. Obtain exact current GAS handler for `gf_vehicle_entry_check` and `gf_vehicle_submit_test` through existing project history or read-only project export.
2. Document which spreadsheet each action writes and where attachments are stored; preserve the operational Google Sheets and Drive folder permissions.
3. Compare the real handler against GF215/GF218 recovery logic and GF219 isolated simulation.
4. Create tests for authentication, replay, duplicate submission, cross-sheet failure and file-upload retry.
5. Only after verified test results, propose authenticated Supabase Edge Function implementation and a reversible rollout. No current LINE webhook or Sheets schema changes.

## Safety status
No production or demo settings changed. No personal data copied. No GAS code deployed. No Sheets modified.
