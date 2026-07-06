-- POS checkout: GL accounts and auto-post flags for sales invoice + official receipt.
begin;

alter table public.pos_settings
  add column if not exists auto_post_accounting boolean not null default true,
  add column if not exists auto_create_receipt boolean not null default true,
  add column if not exists sales_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists receivable_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists cash_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists card_account_id bigint references public.fin_accounts(id) on delete set null;

comment on column public.pos_settings.auto_post_accounting is 'On checkout, create/post sales invoice journal (DR A/R, CR sales, CR VAT).';
comment on column public.pos_settings.auto_create_receipt is 'On checkout, create official receipt applying payment to the sale.';

commit;
