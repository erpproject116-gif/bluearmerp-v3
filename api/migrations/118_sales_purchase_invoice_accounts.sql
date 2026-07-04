-- Accounting "invoice" fields for Sales and Purchases (Acct I / Acct II),
-- plus a link to the generated draft journal entry and per-tenant auto-post flags.
begin;

alter table public.sa_sales
  add column if not exists sales_account_id bigint references public.fin_accounts(id),
  add column if not exists deposit_account_id bigint references public.fin_accounts(id),
  add column if not exists invoice_fees numeric(18,4) not null default 0,
  add column if not exists invoice_remark text,
  add column if not exists invoice_journal_entry_id bigint references public.fin_journal_entries(id);

alter table public.fin_supplier_invoices
  add column if not exists purchase_account_id bigint references public.fin_accounts(id),
  add column if not exists withdrawal_account_id bigint references public.fin_accounts(id),
  add column if not exists invoice_fees numeric(18,4) not null default 0,
  add column if not exists invoice_remark text,
  add column if not exists invoice_journal_entry_id bigint references public.fin_journal_entries(id);

alter table public.tenant_process_policies
  add column if not exists accounts_auto_post_sales boolean not null default false,
  add column if not exists accounts_auto_post_purchase boolean not null default false;

commit;
