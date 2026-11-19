# LINE identity mapping writer investigation — 2026-11-13 (read-only)

Target project `tgxrnrqxafytyqfwwsag`. Inspected `information_schema.routines` for references to `gf_line_driver_identity_prod`, and the schema of the mapping and driver master tables. No row-level personal data read; no mutations.

## Verified

- `gf_line_driver_identity_prod` contains exactly **0 rows** (previous count query).
- `gf_driver_match_master_prod` contains approximately **178 rows** by statistics (not exact-count verified).
- Within the SQL routine definitions visible through `information_schema.routines`, the only function referencing `gf_line_driver_identity_prod` is `gf_link_mypage_from_verified_line`. It **reads** the table to resolve LINE user ID to DriverID. No SQL routine writer was found by this method.
- Mapping columns: `line_user_id`, `driver_id`, `receipt_id`, `line_reception_id`, `source_key`, `synced_at`.
- Driver master columns: `driver_id`, `full_name`, `name_key`, `phone_number`, `driver_status`, `synced_at`, `email`.

## Interpretation and limitations

- The LINE verification RPC cannot link a new driver via this table while it remains empty.
- The presence of receipt/reception/source keys suggests an intended synchronization from LINE intake records, but the origin is **not yet proven**.
- Absence of a SQL routine writer does not rule out Edge Function, GAS, API, or direct service-role writes. Trigger definitions, external code, deployment configs and logs have not yet been exhaustively checked.
- Never synthesize LINE-to-driver mappings from name, phone, or email alone; identity provenance and permission must be verified.

## Next safe actions

1. Trace GAS vehicle request handlers and LINE LIFF/webhook code for a verified `line_user_id` and stable `driver_id` pair.
2. Inspect Edge Functions for direct table inserts/upserts; inspect triggers and integration configuration.
3. Identify authoritative source of the mapping and design idempotent, audited sync; test with synthetic data before production changes.
4. No identity rows inserted and no endpoint or LINE settings changed.
