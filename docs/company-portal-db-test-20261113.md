# 法人ポータル DB テスト結果 — 2026-11-13

Environment: Supabase project `goldfirst-demo` (`zwprphmfgobkektzsuti`), NOT `goldfirst-tokyo-test`.

## Applied
- Four isolated tables: gf_company_portal_companies, gf_company_portal_members, gf_company_portal_vehicles, gf_company_portal_affiliation_aliases.
- RLS enabled on all four; authenticated users have SELECT only on the first three; no client permissions for aliases.
- Authorization via authenticated user membership and company_id; no browser-selectable company switch.
- No production vehicle data copied or published.

## Transactional tests
Synthetic UPs and Chameleon companies and one vehicle each were inserted inside rollback-only transactions.
- UPs test user: one vehicle, UP-001.
- Chameleon test user: one vehicle, CH-001.
- Unregistered user: zero vehicles.
All test fixtures rolled back. These are SQL role/JWT-claim simulations, **not end-to-end real Supabase Auth login tests**.

## Still required before release
- Set up real test Auth users and verify login and direct REST requests.
- Validate tenant reassignment removes former company access.
- Review exact aliases for 所属会社名; blank and unapproved values stay invisible.
- Implement trusted sync with stale-record removal.
- Connect UI and verify date/status display; no production LINE/menu changes.
