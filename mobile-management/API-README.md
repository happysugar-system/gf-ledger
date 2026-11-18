# Read-only vehicle API (deployed staging endpoint)

Endpoint: `https://tgxrnrqxafytyqfwwsag.supabase.co/functions/v1/gf-mobile-vehicles-read`

Deployed Edge Function: `gf-mobile-vehicles-read`, version 1, JWT verification enabled.

Request: `GET ?limit=50&cursor=V000050` with `Authorization: Bearer <Supabase access token>` and standard Supabase publishable/anon `apikey` header when required by the gateway.

Response: `{ "vehicles": [{ "vehicle_id": "...", "vehicle_number": "...", "vehicle_data": {}, "updated_at": "..." }], "nextCursor": "..." | null }`.

Security: Edge Function independently verifies JWT via auth.getUser, checks `gf_staff_access_self` for `access_granted === true`, then reads `gf_vehicles` using server-only service role key. No direct browser table access or public personal data. Browser CORS origin restricted to `https://happysugar-system.github.io`.

**Not yet end-to-end verified:** authenticated 200 response, unauthorized 401/403, CORS, all pages, and 63-field reconciliation. Production mobile UI is not connected. No write endpoint exists. Existing data, triggers, GAS, and portal remain untouched.

Reader module `mobile-management/vehicle-reader.mjs` now accepts the full function URL as `apiBase` and optional `cursor`. For browser use, pass a current Supabase access token; do not store service role secrets in client code.

Next steps: execute authenticated/unauthorized smoke tests, verify counts and headers, integrate staging UI behind staff login, and run reconciliation against the sheet before any writes.
