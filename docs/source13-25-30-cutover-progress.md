# GOLD FIRST source-13 / 3-sheet migration: 25 & 30 progress (2026-11-28)

## Status: development branch only, NOT DEPLOYED

Source: user-uploaded **【開発版】GOLD FIRST 整理 (13).json** (source-13) reviewed locally. Canonical system of record is the existing production 63-column vehicle ledger; the **isolated** test ledger retains those 63 headers plus 8 tested extensions. Never overwrite production headers/order or delete old sheets before full reconciliation.

### 25 / mobile loan information display

Generator: `scripts/gf-patch-source13-loan-display.py`.

- GF3 mode reads substitution loan destination / area / notes from the **isolated 車両台帳** fields `代車貸出先`, `代車貸出エリア`, `代車貸出備考`.
- Normal loan fields `貸出先`, `貸出エリア`, `貸出備考` have no approved canonical column mapping yet. Normal loan lookup in GF3 mode intentionally throws instead of using substitution fields.
- Strict `V9xxxxx` vehicle IDs, full-cell search, duplicate VehicleID fail-closed in GF3; original legacy single-result search remains when GF3 mode is off.
- GF3 mode explicitly blocks seven **unmigrated 25-series write entrypoints**, including actual receipt, actual worker, loan projection and setup. This is NOT a production-ready replacement for processing actuals.

Verification: source-13 anchors matched, generated 25-series script passed `node --check`; six local mocked display scenarios passed, no external writes. Existing return/cancel tests intentionally not rerun.

### 30 / canonical vehicle+master read projection

`integrations/gas/review/GF3_VehicleSyncReadAdapter.gs` provides `GF3_VehicleSyncRead_(book,VehicleID)`, guarded by `GF3_AssertBook_`, `GF3_AssertSheet_`, `GF3_Columns_`. No production license or old-sheet lookup. Reads canonical vehicle, current driver from ドライバーマスター using **unique** ID and reconciles current user name; returns historical names/IDs/document and Drive links unchanged. No writes, no Driver Drive creations.

Verification: 10 mocked cases passed, including bad ID, duplicate VehicleID, duplicate DriverID, missing driver, name mismatch; zero external writes.

`integrations/gas/review/GF3_ReturnHistoryPlan.gs` provides pure `GF3_ReturnHistoryPlan_(before,after,receipt)` that proposes current->previous and previous->previous-previous only after confirmed completed return with cleared current borrower. No automatic history shift during ordinary sync/assignment. It **does not** implement atomic application, receipt deduplication, rich text link transfer or rollback; those must be integrated with actual/history transactional worker before use. Verification: 10 pure tests passed; no writes.

### Unfinished, not safe to deploy

1. Source-13's `車両台帳の1台を同期する` still reads/writes 利用者管理 and 車両状況, creates/renames Drive folders, auto-selects/creates drivers and changes statuses. **Do not run in GF3** until fully isolated. The existing generator only handles 25's mobile *display*, not a working actual service.
2. 25 actual queue/history/return and 24 cancellation need a coordinated, idempotent worker and rich document snapshot validation. Existing passing return/cancel tests remain accepted.
3. 60 documents/photos/Drive and calendar/40 still have side-effecting old paths; staff management, driver mypage, monthly delivery, and operational test URL are not connected.
4. An approved destination for **normal loan** fields is required before changing normal-loan display or projection. Never infer that substitution columns represent normal loans.
5. No script properties, deployment URLs, live calendars, production workbooks or old archive sheets were changed in this update.
