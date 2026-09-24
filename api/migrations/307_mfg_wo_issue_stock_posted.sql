-- Taking a serial or lot on a job now moves on-hand stock at once.
-- stock_posted marks rows whose stock already moved so Complete does not post twice.
begin;

alter table public.mfg_wo_issue_lots
  add column if not exists stock_posted boolean not null default false;

alter table public.mfg_wo_issue_serials
  add column if not exists stock_posted boolean not null default false;

commit;
