begin;
alter table public.gf3_document_receipts_test
  drop constraint gf3_document_receipts_test_state_check,
  add constraint gf3_document_receipts_test_state_check
  check (state in ('待機','保存中','完了','取消中','取消済','要確認','中断済'));
-- After a read-only Drive and ledger reconciliation, release only the failed
-- synthetic receipt that never acquired a PDF. Preserve the receipt itself.
update public.gf3_document_receipts_test
set state='中断済'
where receipt_id='TEST-GF3-4E70626C-9EA1-42A7-AB58-2821FAD48640'
  and vehicle_id='V900005' and kind='車両書類' and state='要確認'
  and drive_file_id is null and new_url is null
  and coalesce(previous_url,'')='' and cancelled_at is null
returning receipt_id,state;
commit;
