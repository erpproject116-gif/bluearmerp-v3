-- Production costs: let users record a completed job in the books with chosen
-- chart-of-accounts legs (Production -> Costs -> Record in books). The account
-- columns remember the choice so a draft entry can be edited and re-synced.
-- Null account columns mean "use the mapped Inventory / COGS defaults".
begin;

alter table public.mfg_work_order_cost_postings
  add column if not exists debit_account_id bigint references public.fin_accounts(id),
  add column if not exists credit_material_account_id bigint references public.fin_accounts(id),
  add column if not exists credit_conversion_account_id bigint references public.fin_accounts(id),
  add column if not exists remark text,
  add column if not exists accounts_set_by_user_id bigint references public.users(id),
  add column if not exists accounts_set_at timestamptz;

commit;
