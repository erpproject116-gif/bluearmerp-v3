-- Hybrid inventory GL defaults + opt-in flag for existing tenants.
-- Qty-tracked items: perpetual (Inventory / GRNI / COGS). Non-stock: expense-on-invoice (unchanged).

alter table public.tenant_finance_defaults
  add column if not exists inventory_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists grni_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists cogs_account_id bigint references public.fin_accounts(id) on delete set null;

comment on column public.tenant_finance_defaults.inventory_account_id is
  'Asset account for on-hand qty-tracked inventory (PH SME leaf e.g. 1200).';
comment on column public.tenant_finance_defaults.grni_account_id is
  'Goods received not invoiced clearing (liability) credited on GR / auto-receive.';
comment on column public.tenant_finance_defaults.cogs_account_id is
  'Expense account debited when qty-tracked stock is issued on sales/SO release.';

alter table public.tenant_process_policies
  add column if not exists inventory_gl_hybrid_enabled boolean not null default false;

comment on column public.tenant_process_policies.inventory_gl_hybrid_enabled is
  'When true, qty-tracked receipts/issues post Inventory/GRNI/COGS journals. New tenants enable via onboard; existing opt in.';

-- Seed GRNI liability account for tenants that already have PH inventory leaf 1200.
insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, is_active, is_group, sort_order)
select distinct a.tenant_id, '2115', 'Goods Received Not Invoiced', 'liability', true, false, 2115
from public.fin_accounts a
where a.account_code = '1200'
  and a.deleted_at is null
  and not exists (
    select 1 from public.fin_accounts x
    where x.tenant_id = a.tenant_id and x.account_code = '2115' and x.deleted_at is null
  );

-- Best-effort auto-map defaults when accounts exist and slots are empty.
update public.tenant_finance_defaults d
set inventory_account_id = a.id, updated_at = now()
from public.fin_accounts a
where d.tenant_id = a.tenant_id
  and d.inventory_account_id is null
  and a.account_code = '1200'
  and a.deleted_at is null and a.is_active and coalesce(a.is_group, false) = false;

update public.tenant_finance_defaults d
set grni_account_id = a.id, updated_at = now()
from public.fin_accounts a
where d.tenant_id = a.tenant_id
  and d.grni_account_id is null
  and a.account_code = '2115'
  and a.deleted_at is null and a.is_active and coalesce(a.is_group, false) = false;

update public.tenant_finance_defaults d
set cogs_account_id = coalesce(d.cogs_account_id, a.id, d.purchase_account_id), updated_at = now()
from public.fin_accounts a
where d.tenant_id = a.tenant_id
  and d.cogs_account_id is null
  and a.account_code = '5010'
  and a.deleted_at is null and a.is_active and coalesce(a.is_group, false) = false;
