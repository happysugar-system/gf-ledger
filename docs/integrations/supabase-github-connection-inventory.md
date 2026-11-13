# Supabase / GitHub connection inventory — read-only 2026-11-13

Evidence: connected Supabase project list and Edge Function list; GitHub `gf-mypage-demo/index.html` and `mypage-line-preview.html` on default branch. No writes to Supabase, GitHub app source, LINE or GAS.

| Supabase project | Project ref | Observed Edge Functions |
|---|---|---|
| goldfirst-tokyo-test | `tgxrnrqxafytyqfwwsag` | `gf-line-mypage-link`, `gf-existing-driver-invite`, `gf-secure-intake-staging-test`, `gf-secure-intake-test-download`, `gf135-transfer-ticket-test`, `gf-vehicle-fast-intake-admin-test`, `gf-fast-upload-smoke-test`, `gf-fast-upload-test`, `gf-fast-auth-diagnostic-test` |
| goldfirst-demo | `zwprphmfgobkektzsuti` | `gf-demo-line-mypage-link` |

## Actual frontend connections

- `gf-mypage-demo/index.html` line ~300 uses `https://tgxrnrqxafytyqfwwsag.supabase.co`.
- `gf-mypage-demo/mypage-line-preview.html` line ~338 uses the same project ref; line ~428 calls `/functions/v1/gf-line-mypage-link`.
- **Do not infer from the repo name `gf-mypage-demo` that it targets `goldfirst-demo`. It currently targets `goldfirst-tokyo-test`.**
- `goldfirst-demo` currently has a separate `gf-demo-line-mypage-link` Edge Function, but the two reviewed frontend files do not call it.

## Security and deployment implications

- Edge Function listing reports `verify_jwt:false` for both line-link functions. This setting alone does not establish whether they authenticate internally; inspect function source and server-side authorization before judging exposure or modifying it.
- Project names are not proof of production status. No migration or endpoint swap is authorized by this inventory.
- A public GitHub repository must not contain Supabase service-role keys, LINE channel secrets, driver personal data, or Drive document contents.
- `gf-ledger` vehicle request still points at a GAS endpoint, not either of the Supabase projects based on the inspected file.

## Next verification steps

1. Read-only inspect the source of both LINE-link Edge Functions and compare their request authentication and response behavior.
2. Identify whether the new demo is intended to replace any existing flow, without changing configuration.
3. Locate/export GAS server handler source for `gf_vehicle_entry_check` and `gf_vehicle_submit_test` before attempting integration tests.
4. Preserve existing frontend URLs and existing LINE/GAS settings until explicit approval and passing integration tests.
