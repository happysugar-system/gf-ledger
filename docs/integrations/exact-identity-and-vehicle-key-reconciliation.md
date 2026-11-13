# Exact identity and vehicle key reconciliation — read-only 2026-11-13

Project: `tgxrnrqxafytyqfwwsag`. Queries were SELECT-only aggregates. No driver names, vehicle numbers, personal data or individual rows were returned. No writes.

## Exact row counts
- `gf_line_driver_identity_prod`: **0**.
- `gf_mypage_links`: **6**.
- `gf_vehicles`: **208**.
- `gf_vehicles_test`: **209**.

## Vehicle key comparison
- Matching `vehicle_id` between main and test: **208**.
- Matching `vehicle_number` between main and test: **208**.
- Main-only `vehicle_id`: **0**.
- Test-only `vehicle_id`: **1**.
- Matching `vehicle_id` with differing `vehicle_number`: **0**.

**Scope limitation:** This compares keys only, not all vehicle columns, updates, source-of-truth, or downstream references. The one extra test row may be an intentional fixture. Do not copy it to main or delete it without provenance review.

## Identity impact
The canonical `gf_link_mypage_from_verified_line` function resolves a LINE ID through `gf_line_driver_identity_prod`; with exactly zero rows there, that particular LINE-to-driver resolution path cannot currently find a matching driver. The existing six `gf_mypage_links` rows may have been established through another route; this does **not** establish that the entire portal is broken.

## Next read-only checks
1. Identify all callers and writers of `gf_line_driver_identity_prod` and the authoritative source of LINE user IDs, including GAS and LIFF; no manual guessed mapping.
2. Compare non-sensitive vehicle columns with aggregate mismatches and verify the one extra test row's provenance without publishing identifying details.
3. Inventory RLS policy expressions for client-facing tables and examine active Edge Function references.
4. Plan synthetic end-to-end identity test; no live registration or production changes without approval.
