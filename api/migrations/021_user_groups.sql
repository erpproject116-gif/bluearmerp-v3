-- User groups: bulk permission templates; users may belong to multiple groups.
begin;

create table if not exists public.tenant_user_groups (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  group_code varchar(50) not null,
  group_name varchar(150) not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, group_code)
);

create index if not exists idx_tenant_user_groups_tenant on public.tenant_user_groups (tenant_id, sort_order);

create table if not exists public.tenant_user_group_members (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  group_id bigint not null references public.tenant_user_groups(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  primary key (group_id, user_id)
);

create index if not exists idx_tenant_user_group_members_user on public.tenant_user_group_members (tenant_id, user_id);

create table if not exists public.tenant_user_group_permissions (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  group_id bigint not null references public.tenant_user_groups(id) on delete cascade,
  permission_code varchar(120) not null references public.permission_registry(permission_code) on delete cascade,
  access_level varchar(10) not null,
  primary key (group_id, permission_code),
  constraint tenant_user_group_permissions_access_check
    check (access_level in ('deny', 'read', 'write'))
);

-- Seed default groups for every tenant
insert into public.tenant_user_groups (tenant_id, group_code, group_name, description, sort_order)
select t.id, v.group_code, v.group_name, v.description, v.sort_order
from public.tenants t
cross join (
  values
    ('sales_agents'::varchar, 'Sales Agents'::varchar, 'Bulk permissions for sales team members'::text, 10),
    ('technicians'::varchar, 'Technicians'::varchar, 'Bulk permissions for after-sales / repair staff'::text, 20)
) as v(group_code, group_name, description, sort_order)
on conflict (tenant_id, group_code) do update
set group_name = excluded.group_name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = now();

-- Sales agents: mirror member role defaults
insert into public.tenant_user_group_permissions (tenant_id, group_id, permission_code, access_level)
select g.tenant_id, g.id, pr.permission_code,
  case
    when pr.module_code in ('user_management') or pr.permission_code like 'settings.%' then 'deny'
    when pr.module_code = 'activity_logs' then 'deny'
    when pr.module_code = 'finance' then 'deny'
    when pr.permission_code in (
      'crm.reports_customer_quotations', 'crm.reports_item_demand',
      'crm.reports_conversion', 'crm.reports_low_stock', 'crm.settings_alert_rules'
    ) then 'deny'
    else 'read'
  end
from public.tenant_user_groups g
cross join public.permission_registry pr
where g.group_code = 'sales_agents'
on conflict (group_id, permission_code) do update set access_level = excluded.access_level;

-- Technicians: inventory + after-sales read/write, limited commercial
insert into public.tenant_user_group_permissions (tenant_id, group_id, permission_code, access_level)
select g.tenant_id, g.id, pr.permission_code,
  case
    when pr.module_code = 'inventory' then 'write'
    when pr.module_code in ('user_management', 'finance', 'crm', 'activity_logs') then 'deny'
    when pr.module_code in ('quotation', 'sales', 'sales_order') then 'read'
    else 'deny'
  end
from public.tenant_user_groups g
cross join public.permission_registry pr
where g.group_code = 'technicians'
on conflict (group_id, permission_code) do update set access_level = excluded.access_level;

commit;
