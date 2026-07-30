-- Phase S2: PH BIR statutory — VAT registers, SLSP exports, 2550M/Q workpaper adjustments.
begin;

-- VAT treatment on transaction tax types (for register classification).
alter table public.quo_tax_types
  add column if not exists vat_category text;

alter table public.quo_tax_types
  drop constraint if exists quo_tax_types_vat_category_check;

alter table public.quo_tax_types
  add constraint quo_tax_types_vat_category_check
  check (vat_category is null or vat_category in ('vatable', 'exempt', 'zero_rated', 'non_vat'));

update public.quo_tax_types set vat_category = 'vatable'
  where vat_category is null and rate_percent > 0 and tax_mode in ('included', 'excluded');

update public.quo_tax_types set vat_category = 'non_vat'
  where vat_category is null and (tax_mode = 'none' or lower(name) like '%non-vat%' or lower(name) like '%non vat%');

update public.quo_tax_types set vat_category = 'exempt'
  where vat_category is null and rate_percent = 0;

-- CPA manual adjustments + audit note for 2550M/Q workpapers.
create table if not exists public.fin_bir_vat_workpaper (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  return_type text not null check (return_type in ('2550M', '2550Q')),
  adj_output_vat numeric(18,4) not null default 0,
  adj_input_vat numeric(18,4) not null default 0,
  adj_vatable_sales numeric(18,4) not null default 0,
  adj_exempt_sales numeric(18,4) not null default 0,
  adj_zero_rated_sales numeric(18,4) not null default 0,
  adj_vatable_purchases numeric(18,4) not null default 0,
  adj_exempt_purchases numeric(18,4) not null default 0,
  adj_zero_rated_purchases numeric(18,4) not null default 0,
  adj_other numeric(18,4) not null default 0,
  audit_note text not null default '',
  updated_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_from, period_to, return_type)
);

create index if not exists idx_fin_bir_vat_workpaper_tenant_period
  on public.fin_bir_vat_workpaper (tenant_id, period_from desc, return_type);

commit;
