# LINE identity RPC comparison — read-only 2026-11-13

Both definitions were inspected through read-only SQL; no records were queried and no SQL or Edge Functions were changed.

| Property | Existing mypage project | Isolated demo project |
|---|---|---|
| Supabase ref | `tgxrnrqxafytyqfwwsag` | `zwprphmfgobkektzsuti` |
| RPC | `public.gf_complete_line_mypage_challenge` | `public.gf_demo_complete_line_challenge` |
| Privilege | SECURITY DEFINER, empty search_path | SECURITY DEFINER, empty search_path |
| Direct RPC EXECUTE | anon=false; authenticated=false | anon=false; authenticated=false |
| Challenge | `gf_mypage_line_challenges` | `gf_demo_line_challenges` |
| Identity mapping | delegates to `gf_link_mypage_from_verified_line` | checks `gf_demo_line_identities`, `gf_demo_driver_profiles` |
| New identity enrollment | depends on delegated function; **not yet inspected** | `gf_demo_enrollment_allowlist` with one-time use |
| Concurrency | challenge row `FOR UPDATE` | challenge row `FOR UPDATE` plus advisory locks for auth, LINE and driver |
| Replay | consumed challenge rejected | consumed challenge rejected |
| Driver conflict | depends on delegated function; **not yet inspected** | checks existing auth/driver links |

**Important:** Both Edge Functions have `verify_jwt:false` but authenticate individual requests internally. Direct RPC privileges appear restricted; this does not prove complete security. Review delegated production function, service-role exposure, RLS, function owner and callable API paths before changes.

## Consolidation decision

- Existing mypage Supabase project remains **provisional** canonical target because frontend currently points there.
- Demo RPC is **not** drop-in replacement; it references different tables and enrollment policies.
- Before implementing unified code, inspect `gf_link_mypage_from_verified_line` and actual schema/constraints, compare identity provenance, and write synthetic tests.
- No database migrations, data moves, deletions, or endpoint changes without explicit approval.
