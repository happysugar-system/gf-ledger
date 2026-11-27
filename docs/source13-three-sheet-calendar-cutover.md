# Source-13 40番GAS: three-sheet validation boundary (2026-11-27)

## Source and scope

- Source: user-supplied **【開発版】GOLD FIRST 整理 (13).json**, 40_車両予定カレンダー.
- Current source-13 calendar candidate: `scripts/gf-patch-source13-calendar.py`.
- Isolated schedule projection adapter: `integrations/gas/review/GF3_Source13ScheduleProjectionAdapter.gs`.
- This is **review source only**. Neither existing production GAS, workbook, Drive, nor Google Calendar was modified.

## Candidate generation

The existing default remains a calendar-event ID preservation patch:

```bash
python scripts/gf-patch-source13-calendar.py "source13.json" "/tmp/40-review.gs"
```

An optional test-only mode adds two extra fail-closed safeguards:

```bash
python scripts/gf-patch-source13-calendar.py "source13.json" "/tmp/40-gf3-review.gs" --three-sheet-validation
```

- An already populated CalendarEventID must resolve to an existing event in its configured calendar. If lookup fails, the candidate **throws rather than creating a replacement**. When no event ID exists, the original new-event path remains possible in normal mode.
- Under `GF3_VALIDATION_ENABLED=true`, the calendar router throws `gf3_calendar_isolation_unverified` *before consulting the license calendar ID*. It cannot create, update, or delete live events through that router.
- The old `GF_予定関連だけ反映する_40` function first delegates to `GF3_Source13ProjectionCutover_` only in validation mode. The adapter refuses to proceed until the known test script/book pass `GF3_AssertBook_`, `GF3_MIGRATION_VERIFIED` and `GF3_SYNC_ENABLED` are true, **and** `GF3_UI_CANONICAL_READ_READY=true` has been explicitly set after actual UI verification. These flags are **not enabled** here.
- The adapter checks the canonical 車両台帳 fields and reads the isolated gf3 schedule API. It never writes old 車両状況/利用者管理 and never mutates calendar events. The *full 40-series file is not yet isolated*: its public entrypoints, other helpers, and license resolution can still reach the production workbook; do not install or execute this candidate as a functioning three-sheet GAS.

## Verified checks (mock/local only)

- Original source-13 anchors matched exactly once in local reproduction, output passed `node --check`.
- Calendar path: existing event update; missing linked event blocks new creation; missing calendar blocks update; no calendar and no existing ID returns empty; new event path remains in **normal mode**; event lookup exception does not create.
- Router: GF3 mode stops before reading license calendar settings; normal mode retains the existing route.
- GF3 adapter: six pure mode checks plus ten mocked scenarios; no external writes.

These do **not** establish deployed GAS parity, a working test UI, safe end-to-end migration, actual event-ID reconciliation, or completed Supabase schedule import.

## Remaining work before enabling

1. Connect source-13 entrypoints to `GF3_Open_` (they currently resolve `C_TEST001` through the production license), and audit 24/25/30/40/60/80 and their invoked dependencies for live Drive, Sheets, Calendar, LINE, and Supabase effects.
2. Replace legacy schedule display/read paths in staff UI and driver mypage with validated canonical ledger + isolated schedule DB reads.
3. Verify calendar route IDs, event ownership and existing EventID mapping in read-only mode. Provide a fully **isolated** calendar for test operations before lifting the calendar hard stop.
4. Validate delivery/monthly totals, history rollback, document links and real isolated user flows; only then consider setting cutover flags.
5. Production deploy remains a separate explicit approval. Do not delete legacy sheets before reconciliation.
