# Three-sheet cutover acceptance gates

Retain 車両台帳 as vehicle source of truth, 名変待ち管理, ドライバーマスター. No new user-facing features in this cutover.

- Preserve existing input rules, Drive links, calendar events and driver history.
- Schedule migration source audit: 190 rows, 188 event IDs, 22 fields, 190 unique IDs. Re-read at cutover; these are audit counts, not fixed migration limits.
- Preserve schedule master rules and all shift fields. Resolve calendar routing from existing configuration; never guess the inspection-expiry calendar or recreate existing events.
- Keep old sheets until every reader/writer and trigger has been redirected and readback matches. Archive rather than delete initially.
- Verify assignment, cancellation, return, retries, duplicate requests, driver display, schedule changes, calendar linkage, and permissions.
- Production writes and cutover require explicit approval. Test-only data must not be mixed with production.
- Staff UI login is required only for end-to-end UI acceptance, not connector-based development.


## 2026-11-26 three-sheet copy schema audit

- New isolated workbook ID: `1WvKxm91E98FoCpge1d_iwmb9RDRhATrSgxR2K7rjAn0`. The three sheet names are correct. The original seven-tab validation workbook remains a backup.
- The new workbook is **not yet an integration-ready schema**. Header audit found all core identifiers present but 4 missing vehicle Drive-folder columns, 8 missing projected driver-contact columns in the ledger, and 7 missing driver-contact columns in the master. Do not confuse three-tab presence and A1:Z200 parity with functional migration acceptance.
- Read-only, fail-closed GAS audit: `integrations/gas/review/GF3_ThreeSheetReadinessAudit.gs`. Its approved script ID and workbook ID must be explicitly configured in a **separate new validation GAS**; it refuses the known old validation script IDs. It does not replace the existing doPost, staff authentication or sync/return worker.
- Before adding any columns, map each needed field to its current primary source and preserve values, rich Drive links, date types, validation and calendar bindings. Avoid creating blank columns and claiming migration succeeded; reconcile the old user/vehicle status sheets and driver master source separately.
- Local-only GAS target configuration and the unsigned old staff routing are outstanding. Do not enable staff writes merely because the read-only schema gate passes. The old `GF_IsolatedValidationBook_`, `GF_MainReturnHistoryEnabled_`, and `GFA_検証接続先を診断` still pin the original validation workbook and must be handled explicitly, with no fallback to production.


## Source-of-truth reconciliation for missing columns (2026-11-26)

Read-only audit of the current production workbook's header row (no live data modified):

| Destination field group | Existing source | Migration rule |
| --- | --- | --- |
| Vehicle folder, latest PDF, vehicle document folder | 車両台帳 | Preserve original rich hyperlink and target value |
| Vehicle-condition and maintenance folders | 車両状況 | Match by unique VehicleID; never copy a display label without its URL |
| Previous driver ID and previous driver's vehicle document | 車両台帳 / 利用者管理 | Compare both sources, flag differences for review |
| Current driver contact projection | 車両台帳 / ドライバーマスター | Join by DriverID; reject differing nonempty source values |
| Driver master contacts, status and notes | ドライバーマスター | Match unique DriverID; do not blank or overwrite occupied targets |

The test 3-sheet workbook contains only 26 columns in 車両台帳 and 7 populated header columns in ドライバーマスター, while the currently active production header rows have 63 and 17 columns respectively. **Three tabs does not mean the schema is ready.** Preserve the full operational schema and field values; the 19 previously identified missing fields are minimum gaps, not a complete data-loss audit.

`integrations/gas/review/GF3_ThreeSheetMigrationPlan.gs` generates candidate cell patches and collision/review reasons only; it does not write, retrieve production data, or expose private values to logs. It must be run only against reviewed snapshots, with Drive rich-link metadata included. Its mock tests cover conflicting values, occupied targets, invalid links and duplicate VehicleID.

`GF3_検証3シート書込前確認` now additionally requires `GF3_MIGRATION_VERIFIED=true` in the *new isolated validation GAS*. Do not set that flag merely after adding headers; it is an explicit acceptance acknowledgement following value/formula/validation/link reconciliation and full end-to-end checks. No existing staff routes or old GAS test workbook guards have been switched.

## Return acceptance evidence and production identity

- Operator-reported isolated R006 readback after return: connected=true, queueState=完了, historyState=完了, beforeMatches=false, afterMatches=true.
- After cancellation and repeated cancellation: connected=true, queueState=取消済, historyState=取消済, beforeMatches=true, afterMatches=false. Do not repeat this isolated test as a prerequisite to schema preparation.
- The original production workbook ID and URL remain unchanged. The three-sheet copy is test-only; never promote its dummy rows into production. Preserve original sheet IDs for the three retained tabs. Archive retired tabs only after dependency and readback checks, with explicit production approval.
- A diagnostic previously overwrote Z1:AA4 in the old validation ledger. Z1 and the R006 target row were corrected sufficiently for the successful readback; remaining original cell restoration is not verified. Diagnostics must log only, never write into ledger cells.
- These results do not certify the new three-sheet environment or production deployment. Keep the migration gate disabled until full schema and integration acceptance.

## Operator-approved canonical schema

Production workbook 17IzIUJeYQw3nO8GZsUSCgLfHVECNINZNkQdg38GW57o is authoritative for existing header names and positions. Operator confirmed this explicitly. Full-schema fixture test passed 8 cases in GAS. Live audit: ledger 63 source / 71 target, all 63 positions differ; waiting 13 / 16, old header 旧シート行 differs from 旧社長シート行; driver master 17 / 36 with blank positions 8–26. No duplicate headers. Align validation schema to production, preserving existing values, formulas, validation and links. Review eight additional ledger fields and three additional waiting fields before appending; do not delete blank-header columns until their contents and metadata are checked. Do not rename or reorder production columns. No production writes authorized.
