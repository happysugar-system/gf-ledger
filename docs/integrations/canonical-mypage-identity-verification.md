# Canonical mypage identity-link verification — read-only 2026-11-13

Target: Supabase project `tgxrnrqxafytyqfwwsag` (current `gf-mypage-demo` frontend target). Inspected `public.gf_link_mypage_from_verified_line(uuid,text)` and execute privileges via SELECT-only SQL. No customer rows, emails, phones, or LINE identifiers were retrieved. No mutations.

## Verified current behavior

- The function is `SECURITY DEFINER` with an empty `search_path`; `anon` and `authenticated` have no direct EXECUTE privilege; `service_role` has EXECUTE.
- Validates input and requires a confirmed email account in `auth.users`.
- Maps a verified LINE user ID to DriverID through `gf_line_driver_identity_prod` joined with `gf_driver_match_master_prod`. The browser does not choose DriverID.
- Locks the auth account and mapped DriverID using transaction advisory locks; checks `gf_mypage_links` for conflicting mappings.
- Locks an existing registration request and rejects `rejected` requests and mismatched applicant names.
- Inserts a new link only when absent, and marks the matching registration request approved.
- Called by `gf_complete_line_mypage_challenge`, which locks and consumes an unexpired, one-use challenge. Edge Function `gf-line-mypage-link` verifies the LINE ID token with LINE before invoking that RPC.

## Important remaining verification

- Confirm uniqueness constraints/indexes on LINE ID, DriverID, auth account and challenge token. Advisory locks alone do not substitute for constraints.
- Confirm RLS on the identity, match master, registration and links tables and access grants for public API roles.
- Confirm the source/provenance and synchronization ownership of `gf_line_driver_identity_prod` and `gf_driver_match_master_prod` before migrating or deleting demo data.
- Check that challenge issuance and verification have appropriate throttling, monitoring and expiry cleanup.
- Verify that automatic approval matches GOLD FIRST's actual enrollment policy; the current function approves when verified identity and registration-name checks pass.
- Confirm the source of the LINE user ID is exclusively the verified Edge Function and never a browser-submitted ID.

## Recommendation

Keep this canonical linking logic intact while consolidating. Do not copy the demo RPC over it: the demo uses a different allowlist-based enrollment path and separate identity tables. Add regression tests using synthetic identities in an isolated database before any live change.

## Safety

This file contains architectural facts only, not secrets or personal records. No deployment, schema change, data move or deletion has occurred.
