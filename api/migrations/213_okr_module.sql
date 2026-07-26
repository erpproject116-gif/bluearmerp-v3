-- OKR module: objectives + key results + registry.
begin;

create table if not exists public.okr_objectives (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  title varchar(500) not null,
  owner_user_id bigint references public.users(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status varchar(20) not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists idx_okr_objectives_tenant
  on public.okr_objectives (tenant_id, status, period_end);

create table if not exists public.okr_key_results (
  id bigserial primary key,
  objective_id bigint not null references public.okr_objectives(id) on delete cascade,
  title varchar(500) not null,
  owner_user_id bigint references public.users(id) on delete set null,
  metric_unit varchar(20) not null default 'percent'
    check (metric_unit in ('number', 'percent')),
  target_value numeric(18,4) not null default 100,
  current_value numeric(18,4) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_okr_key_results_objective
  on public.okr_key_results (objective_id, sort_order);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('okr', 'OKRs', 'tenant', false, true, 56)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'okr', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('okr', 'okr', null, 'OKR (module)', 0),
  ('okr.objectives', 'okr', 'objectives', 'OKR Objectives', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'okr'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
