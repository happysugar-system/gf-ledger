-- Apply in one transaction to the matching environment before enabling the bridge.
alter table public.gf_driver_document_review_requests
  drop constraint gf_driver_document_review_requests_status_check,
  add constraint gf_driver_document_review_requests_status_check
    check (status in ('requested','submitted','approving','approved'));

drop index public.gf_document_review_one_open;
create unique index gf_document_review_one_open
  on public.gf_driver_document_review_requests(receipt_id,document_type)
  where status in ('requested','submitted','approving');
