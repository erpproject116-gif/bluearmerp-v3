-- Tier C: Fixed Assets MVP — asset register, straight-line monthly depreciation, posted JE on run.
begin;

insert into public.fin_gl_accounts (account_code, account_name, sort_order) values
  ('1510', 'Fixed Assets', 150),
  ('1519', 'Accumulated Depreciation', 151),
  ('5510', 'Depreciation Expense', 550)
on conflict (account_code) do update
set account_name = excluded.account_name, sort_order = excluded.sort_order;

insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, sort_order)
select t.id, g.account_code, g.account_name,
  case
    when g.account_code like '1%' then 'asset'
    when g.account_code like '5%' then 'expense'
    else 'asset'
  end,
  g.sort_order
from public.tenants t
cross join public.fin_gl_accounts g
where t.status = 'active' and g.account_code in ('1510', '1519', '5510')
on conflict (tenant_id, account_code) do nothing;

create table if not exists public.fin_fixed_assets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  asset_code varchar(30) not null,
  asset_name varchar(255) not null,
  acquisition_date date not null default current_date,
  acquisition_cost numeric(18,4) not null check (acquisition_cost > 0),
  salvage_value numeric(18,4) not null default 0 check (salvage_value >= 0),
  useful_life_months int not null check (useful_life_months > 0),
  asset_account_code varchar(20) not null default '1510',
  depreciation_account_code varchar(20) not null default '5510',
  accumulated_depreciation_account_code varchar(20) not null default '1519',
  accumulated_depreciation numeric(18,4) not null default 0 check (accumulated_depreciation >= 0),
  status varchar(20) not null default 'active'
    check (status in ('active', 'fully_depreciated', 'disposed')),
  last_depreciation_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, asset_code),
  check (salvage_value < acquisition_cost)
);

create index if not exists idx_fin_fixed_assets_list
  on public.fin_fixed_assets (tenant_id, status, acquisition_date desc);

create table if not exists public.fin_depreciation_runs (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  run_date date not null default current_date,
  period_year int not null,
  period_month int not null check (period_month >= 1 and period_month <= 12),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),
  journal_entry_id bigint references public.fin_journal_entries(id),
  total_amount numeric(18,4) not null default 0,
  created_by_user_id bigint references public.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_year, period_month)
);

create index if not exists idx_fin_depreciation_runs_list
  on public.fin_depreciation_runs (tenant_id, run_date desc);

create table if not exists public.fin_depreciation_run_lines (
  id bigserial primary key,
  run_id bigint not null references public.fin_depreciation_runs(id) on delete cascade,
  asset_id bigint not null references public.fin_fixed_assets(id),
  line_no int not null,
  depreciation_amount numeric(18,4) not null check (depreciation_amount > 0),
  unique (run_id, line_no),
  unique (run_id, asset_id)
);

create index if not exists idx_fin_depreciation_run_lines_asset
  on public.fin_depreciation_run_lines (asset_id);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('fixed_assets', 'Fixed Assets', 'tenant', false, true, 37)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('fixed_assets', 'finance')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'fixed_assets', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('fixed_assets', 'fixed_assets', null, 'Fixed Assets (module)', 0),
  ('fixed_assets.assets', 'fixed_assets', 'assets', 'Asset Register', 10),
  ('fixed_assets.assets_new', 'fixed_assets', 'assets_new', 'New Asset', 20),
  ('fixed_assets.depreciation_runs', 'fixed_assets', 'depreciation_runs', 'Depreciation Runs', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'fixed_assets'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
