# GOLD FIRST mobile management migration (staging)

Status: design and integration preparation only. **Do not deploy to production** until authenticated API, authorization, and reconciliation tests pass.

## Source of truth and UI
- Base UI: mobile demo v9 (local prototype; not yet production-integrated).
- Spreadsheet: `GOLD FIRST 車両・ドライバー管理`, tab `車両台帳`, 63 columns.
- Match all 63 columns by **exact header name**, never by fixed column position.
- A column may be displayed in only one relevant UI workflow; system fields are read-only.
- Basic information includes 名義変更日.
- 貸出・返却: 貸出開始, 返却完了, 代車開始, 代車返却. No duplicate 納車完了 action.
- 代車貸出先, 代車貸出エリア, 代車貸出備考 remain editable in the loan/return workflow; 代車返却日 is recorded by the action, not a second form.
- 予定: one unified registration UI; 車検, 12点検, 名義変更, 整備, 納車予定, 貸出予定, 返却予定, 代車開始予定, 代車返却予定. No duplicated detailed schedule form.
- Photos: camera continuous capture OR multiple-file upload. Documents (記録事項/免責/車検証; license front/back) accepted in arbitrary order; server-side AI classification + user confirmation required.
- Existing Drive folders and document URLs remain accessible with server-side access checks.

## Performance and data safety
- GitHub Pages hosts only public frontend assets. Never commit private photos, licenses, service keys, or personal data.
- Supabase Auth + staff authorization at the API/database layer; RLS and role checks on all reads/writes.
- Supabase serves fast indexed list/search; write operations must preserve existing Sheet/Drive synchronization and history.
- GAS is a temporary secure integration backend for OCR, PDFs, Drive and existing workflows; no unauthenticated public GAS proxy.
- Use stable VehicleID/DriverID keys, versioned writes, idempotency keys, and durable retry queues for sync.
- Do not treat an accepted UI write as fully synchronized until both persistence and sync status are known.
- Never change current production GAS triggers or deployed portal while staging.

## Automated acceptance tests (must pass before cutover)
1. Exact 63 header names matched and each column has exactly one display or system mapping.
2. All schedule date fields use date picker; registration updates only intended record.
3. Loan/return/loaner actions produce exactly one history record; retries cannot duplicate.
4. Document AI recognizes shuffled input; missing/ambiguous files block confirmation and allow retake.
5. Camera multi-capture and file multi-select work on mobile HTTPS.
6. New driver requires front and back license images.
7. Photos and documents saved to correct Drive folder, accessible only to authorized staff.
8. Supabase ↔ Sheet reconciliation reports zero unexpected diffs; errors are queued and visible.
9. Unauthorized and revoked staff cannot read or write data.
10. Existing production app remains available and unchanged until explicit cutover approval.

## Next integration inputs
- Existing GAS server source for vehicle CRUD, driver CRUD, event history, schedules, OCR, Drive.
- Current Supabase table/Edge Function definitions and reconciliation mappings.
- Baseline smoke-test data consisting only of synthetic VehicleID/DriverID and synthetic documents.
