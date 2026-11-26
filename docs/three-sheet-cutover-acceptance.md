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
