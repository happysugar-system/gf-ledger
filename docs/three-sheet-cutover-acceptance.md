# Three-sheet cutover acceptance gates

Retain 車両台帳 as vehicle source of truth, 名変待ち管理, ドライバーマスター. No new user-facing features in this cutover.

- Preserve existing input rules, Drive links, calendar events and driver history.
- Schedule migration source audit: 190 rows, 188 event IDs, 22 fields, 190 unique IDs. Re-read at cutover; these are audit counts, not fixed migration limits.
- Preserve schedule master rules and all shift fields. Resolve calendar routing from existing configuration; never guess the inspection-expiry calendar or recreate existing events.
- Keep old sheets until every reader/writer and trigger has been redirected and readback matches. Archive rather than delete initially.
- Verify assignment, cancellation, return, retries, duplicate requests, driver display, schedule changes, calendar linkage, and permissions.
- Production writes and cutover require explicit approval. Test-only data must not be mixed with production.
- Staff UI login is required only for end-to-end UI acceptance, not connector-based development.
