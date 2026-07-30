-- Phase S0: PH BIR statutory foundation — ATC master, tax role accounts, taxpayer profile, document series.
-- ATC seed mirrors api/data/bir_atc_seed_v202607.csv (CPA must verify before filing).
begin;

-- 1. Extend withholding tax code master with BIR ATC metadata.
alter table public.fin_withholding_tax_codes
  add column if not exists atc_code text,
  add column if not exists tax_type text,
  add column if not exists income_payment_type text,
  add column if not exists rr_reference text,
  add column if not exists effective_from date,
  add column if not exists effective_to date;

alter table public.fin_withholding_tax_codes
  drop constraint if exists fin_withholding_tax_codes_tax_type_check;

alter table public.fin_withholding_tax_codes
  add constraint fin_withholding_tax_codes_tax_type_check
  check (tax_type is null or tax_type in ('EWT', 'FWT', 'compensation'));

create index if not exists idx_fin_withholding_tax_codes_atc
  on public.fin_withholding_tax_codes (tenant_id, atc_code)
  where atc_code is not null;

-- Map legacy WHT001-style codes to published ATCs.
update public.fin_withholding_tax_codes w set
  atc_code = v.atc_code,
  tax_type = v.tax_type,
  income_payment_type = v.income_payment_type,
  rr_reference = v.rr_reference,
  effective_from = v.effective_from::date,
  description = case when w.description like 'Creditable withholding%' then v.description else w.description end
from (values
  ('WHT001', 'WC010', 'EWT', 'goods', 'Income payment to suppliers of goods', 'RR-2-1998', '2020-01-01'),
  ('WHT002', 'WC020', 'EWT', 'services', 'Income payment to suppliers of services', 'RR-2-1998', '2020-01-01'),
  ('WHT005', 'WC160', 'EWT', 'rent', 'Rental of real property', 'RR-2-1998', '2020-01-01'),
  ('WHT010', 'WC120', 'EWT', 'professional', 'Professional fees paid to juridical persons', 'RR-2-1998', '2020-01-01'),
  ('WHT015', 'WC030', 'EWT', 'services', 'Income payment to suppliers (15%)', 'RR-2-1998', '2020-01-01')
) as v(code, atc_code, tax_type, income_payment_type, description, rr_reference, effective_from)
where w.code = v.code and w.atc_code is null;

-- Seed additional common PH EWT/FWT ATC rows per tenant (skip when code already exists).
insert into public.fin_withholding_tax_codes (
  tenant_id, code, description, rate_pct, active,
  atc_code, tax_type, income_payment_type, rr_reference, effective_from
)
select t.id, v.code, v.description, v.rate_pct, true,
  v.atc_code, v.tax_type, v.income_payment_type, v.rr_reference, v.effective_from::date
from public.tenants t
cross join (values
  ('WI010', 'WI010', 'EWT', 'Professional/talent fees (individual) 10%', 10.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WI020', 'WI020', 'EWT', 'Professional/talent fees (individual) 5%', 5.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WI030', 'WI030', 'EWT', 'Professional/talent fees (individual) 15%', 15.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WI050', 'WI050', 'EWT', 'Professional/talent fees (individual) 2%', 2.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WI100', 'WI100', 'EWT', 'Income distribution to beneficiaries', 10.0, 'other', 'RR-2-1998', '2020-01-01'),
  ('WI151', 'WI151', 'EWT', 'Income payment to OCW / seaman', 5.0, 'compensation', 'RR-2-1998', '2020-01-01'),
  ('WI156', 'WI156', 'EWT', 'Income payment to OCW / seaman (agency)', 2.0, 'compensation', 'RR-2-1998', '2020-01-01'),
  ('WI330', 'WI330', 'EWT', 'Income payment to non-resident alien', 25.0, 'other', 'RR-2-1998', '2020-01-01'),
  ('WB010', 'WB010', 'FWT', 'Fringe benefit tax', 35.0, 'fringe', 'RR-3-1998', '2020-01-01'),
  ('WC100', 'WC100', 'EWT', 'Rental of personal property', 5.0, 'rent', 'RR-2-1998', '2020-01-01'),
  ('WC140', 'WC140', 'EWT', 'Income payment to general professional partnerships', 10.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WC170', 'WC170', 'EWT', 'Income payment to partners in GPP', 10.0, 'professional', 'RR-2-1998', '2020-01-01'),
  ('WC190', 'WC190', 'EWT', 'Income payment to top management', 20.0, 'compensation', 'RR-2-1998', '2020-01-01'),
  ('WC250', 'WC250', 'EWT', 'Income payment to non-resident alien (corporate)', 25.0, 'other', 'RR-2-1998', '2020-01-01'),
  ('WC280', 'WC280', 'EWT', 'Income payment to non-resident alien (individual)', 25.0, 'other', 'RR-2-1998', '2020-01-01'),
  ('WC515', 'WC515', 'EWT', 'Commission and brokerage fees', 10.0, 'commission', 'RR-2-1998', '2020-01-01'),
  ('COMP01', 'COMP01', 'compensation', 'Compensation withholding (payroll)', 0.0, 'compensation', 'RR-2-1998', '2020-01-01')
) as v(code, atc_code, tax_type, description, rate_pct, income_payment_type, rr_reference, effective_from)
on conflict (tenant_id, code) do nothing;

-- 2. Tax role GL accounts on tenant finance defaults.
alter table public.tenant_finance_defaults
  add column if not exists ewt_payable_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists fwt_payable_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists compensation_wht_payable_account_id bigint references public.fin_accounts(id) on delete set null,
  add column if not exists ewt_receivable_account_id bigint references public.fin_accounts(id) on delete set null;

-- 3. Taxpayer profile (tenant statutory settings).
alter table public.tenant_finance_defaults
  add column if not exists rdo_code text,
  add column if not exists tax_regime text,
  add column if not exists registration_date date,
  add column if not exists line_of_business text,
  add column if not exists cor_file_url text;

alter table public.tenant_finance_defaults
  drop constraint if exists tenant_finance_defaults_tax_regime_check;

alter table public.tenant_finance_defaults
  add constraint tenant_finance_defaults_tax_regime_check
  check (tax_regime is null or tax_regime in ('vat', 'non_vat', 'percentage'));

-- 4. BIR document series control.
create table if not exists public.fin_document_series (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  doc_type text not null,
  prefix text not null default '',
  start_no bigint not null default 1,
  end_no bigint not null,
  next_no bigint not null default 1,
  permit_ref text,
  cas_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc_type, prefix),
  check (start_no >= 1),
  check (end_no >= start_no),
  check (next_no >= start_no and next_no <= end_no + 1)
);

create index if not exists idx_fin_document_series_tenant_active
  on public.fin_document_series (tenant_id, doc_type)
  where is_active;

-- Permissions for statutory settings.
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.statutory_read', 'finance', 'statutory_read', 'BIR statutory settings (read)', 84),
  ('finance.statutory_write', 'finance', 'statutory_write', 'BIR statutory settings (write)', 85)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('finance.statutory_read', 'finance.statutory_write')
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
