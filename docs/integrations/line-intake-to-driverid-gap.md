# GF LINE intake → DriverID → MyPage identity gap (source-backed, read-only)

Date: 2026-11-13. Reviewed user-provided GAS pasted files `貼り付けたテキスト（1）(20261113-032950).txt` (100_LINE受付.gs) and `貼り付けたテキスト（1）(20261113-044726).txt` (GF214–218). No code executed or deployed; no live records modified.

## Existing implemented chain

1. LINE Webhook `doPost` receives the `車両依頼` message and invokes `LINE_車両依頼カードを返信_` with LINE `event.source.userId`.
2. `LINE_車両依頼専用URL_` stores `GF_VEHICLE_ENTRY_<token> → lineUserId` in GAS ScriptCache for up to 3600 seconds and appends only the opaque `gf_entry` token to the form URL. This is a LINE event source binding, **not a DriverID verification**.
3. `doGet?action=gf_vehicle_entry_check` verifies token presence and a LINE ID-shaped cached value. `doPost?action=gf_vehicle_submit_test` dispatches `GF_車両テスト送信_`.
4. `GF_車両テスト送信_` resolves the cached LINE user ID and forwards `bridge_line_user_id`, `bridge_request_id` and a configured bridge secret to a separate GAS receiver; on `ok:true` it invokes `GF115_車両依頼受付へ反映_` and removes the cache token. Receiver's exact deployed code and GF115 implementation are not yet confirmed in the reviewed material.
5. GF215's proposed production save `GF215_本番受付保存_` (separately gated by `GF215_WRITE_ENABLED=YES`) writes LINE ID to the `LINE受付管理` sheet but sets the `DriverID` field to an **empty string**, and marks the request as `未照合（管理者確認）`. This is intentional deferred matching, not proof of a broken LINE ID transfer.
6. GF218 includes idempotency/orphan recovery by request marker, preserving existing rows and rejecting mismatched LINE users. This protects the two-Sheet write, but does not resolve DriverID.
7. Supabase `gf_line_driver_identity_prod` has exactly 0 rows; `gf_link_mypage_from_verified_line` expects an existing LINE-to-DriverID mapping. Thus the missing link is a verified, authorized DriverID match and an audited sync into that table, not necessarily LINE ID capture.

## Security and readiness distinctions

- `LINE_動作環境='DEMO'` in the provided 100_LINE受付.gs; GF215 is **not wired** into the active webhook and its production write flag defaults OFF.
- The GAS entry token is a bearer token bound to a webhook-sourced LINE user ID; it is not by itself evidence that the person is the holder of an existing driver record.
- A separate `GF215_照合キー_` helper HMACs LINE user ID, but no direct Supabase identity-table writer is established by these snippets.
- Do not infer DriverID by name, phone or email without corroborated authorization. Do not copy test identities into production.

## Recommended implementation design (not deployed)

A. Keep existing 100_LINE受付.gs and GF215/218 behavior unchanged while implementing a **read-only reconciliation report** showing counts of LINE requests: no DriverID, candidate ambiguous, previously verified, and mapping conflicts (no PII in logs).
B. Add an explicit administrator approval/verified driver matching workflow using canonical DriverID and provenance of the LINE account, with conflict checks against existing Supabase mappings.
C. Only after approval, implement an idempotent server-side service-role sync to `gf_line_driver_identity_prod` with unique LINE ID, DriverID and source receipt keys, audit trail, rollback plan, and synthetic tests.
D. Test portal registration and LINE link end-to-end in isolated environment before enabling any live writes or changing LIFF/webhooks.

## Open source verification

Need exact GF115 implementation and test receiver handler, plus deployed GAS version, to confirm current production behavior. Prior assertions that the LINE user ID was entirely lost at final form submission were too strong; GAS cache/bridge code shows it can be recovered server-side.
