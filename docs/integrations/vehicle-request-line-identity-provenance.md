# Vehicle request LINE identity provenance trace — 2026-11-13

Source: current GitHub default-branch `vehicle-request.html` inspected at lines 680–860 and 1229–1330; existing Supabase RPC and schema findings. Read-only; no live GAS calls, no tokens submitted, no configuration changes.

## Verified frontend flows

1. LIFF is initialized using `2012019621-Gu0mOfuK`. A browser login state is displayed as **demo only**; the comment explicitly requires server-side ID-token verification for identity use.
2. Separate LINE verification/test GAS endpoint receives `id_token` via POST from `verifyLineIdentityOnServer()`. The `save145Form()` and `save146Docs()` test paths also send `id_token` and test data; the UI says 145 saves text to a test Sheet and 146 saves dummy documents to test Drive. Server implementation and actual persistence have **not** been verified.
3. Final vehicle request `demoSubmit()` posts to a **different** GAS endpoint with `action=gf_vehicle_submit_test`, `gf_entry`, form fields and document data. It **does not include `id_token`** in its POST fields.
4. A `gf_entry` token is checked via the final GAS endpoint before showing the form. This may authorize entry to the form, but the frontend alone does not establish that it binds to a verified LINE user ID and DriverID on the server.
5. The Supabase canonical LINE-to-driver identity table `gf_line_driver_identity_prod` is exactly empty, and the canonical RPC requires a preexisting mapping. Its schema includes `receipt_id`, `line_reception_id`, and `source_key`, but these are **not proof** of an implemented writer.

## Critical integration gap

There are currently **two different GAS endpoints** and a separate Supabase LINE linking function. The browser-side final vehicle submission does not transmit the LINE ID token; it may still be securely bound through the server-issued `gf_entry` token **if** the GAS backend verifies and persists that association. The GAS backend is not present in the inspected GitHub repository, so this remains unverified. Do not infer identity provenance from a valid `gf_entry` alone.

## Next safe checks

- Obtain read-only source of both deployed GAS `doPost` / `doGet` handlers and verify exact deployment versions and project ownership.
- Trace whether `gf_entry` is issued only after verified LINE webhook authentication, and whether its server-side record stores verified LINE user ID, expiry, single-use behavior and receipt/DriverID.
- Trace 145/146 test receipt to LINE user ID and any subsequent approved DriverID mapping. Distinguish test receipts from live intake.
- Inspect Edge Functions and triggers for any writer to `gf_line_driver_identity_prod`.
- Only after proven provenance design an idempotent audited sync, tested with synthetic identities. No live driver auto-linking from names, phone or email alone.

## Privacy and safety

No real tokens, personally identifying data, document contents, or live endpoint credentials are copied into this document. No production or demo data was modified.
