-- Tier C Phase 5: Ad-hoc BI — per-user saved report filter sets.
begin;

create table if not exists public.bi_saved_views (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  name varchar(120) not null,
  report_key varchar(80) not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bi_saved_views_user
  on public.bi_saved_views (tenant_id, user_id, report_key);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('bi', 'Ad-hoc BI', 'tenant', false, true, 8)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('bi', 'dashboard')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'bi', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('bi', 'bi', null, 'Ad-hoc BI (module)', 0),
  ('bi.saved_views', 'bi', 'saved_views', 'Saved Report Views', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'bi'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
