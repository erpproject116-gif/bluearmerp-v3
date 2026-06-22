-- Quotation module registry + Tax Management tables
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('quotation', 'Quotation', 'tenant', false, true, 20)
on conflict (module_code) do nothing;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('quotation', 'inventory')
on conflict do nothing;

create table if not exists public.quo_tax_types (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  tax_code char(5) not null,
  name varchar(150) not null,
  tax_mode text not null default 'included'
    check (tax_mode in ('included', 'excluded', 'none')),
  rate_percent numeric(8,4) not null default 0,
  formula_json jsonb,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, tax_code)
);

create index if not exists idx_quo_tax_types_list
  on public.quo_tax_types (tenant_id, sort_order, name)
  where deleted_at is null;

create table if not exists public.quo_currencies (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  currency_code varchar(20) not null,
  name varchar(100) not null,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, currency_code)
);

create index if not exists idx_quo_currencies_list
  on public.quo_currencies (tenant_id, name)
  where deleted_at is null;

-- Seed default tax types and Domestic currency for all tenants
insert into public.quo_currencies (tenant_id, currency_code, name, is_default, status)
select t.id, 'DOMESTIC', 'Domestic', true, 'active'
from public.tenants t
on conflict (tenant_id, currency_code) do nothing;

insert into public.quo_tax_types (tenant_id, tax_code, name, tax_mode, rate_percent, sort_order, status)
select t.id, v.tax_code, v.name, v.tax_mode, v.rate_percent, v.sort_order, 'active'
from public.tenants t
cross join (
  values
    ('00001', 'Vat Included', 'included', 12::numeric, 10),
    ('00002', 'Non-VAT', 'none', 0::numeric, 20),
    ('00003', 'VAT-Inc 5%', 'included', 5::numeric, 30),
    ('00004', 'VAT-Inc 6%', 'included', 6::numeric, 40),
    ('00005', 'Vat 30%', 'excluded', 30::numeric, 50)
) as v(tax_code, name, tax_mode, rate_percent, sort_order)
on conflict (tenant_id, tax_code) do nothing;

insert into public.tenant_code_sequences (tenant_id, entity_type, last_value)
select t.id, 'tax_type', 5
from public.tenants t
on conflict (tenant_id, entity_type) do update
  set last_value = greatest(tenant_code_sequences.last_value, excluded.last_value);

commit;
