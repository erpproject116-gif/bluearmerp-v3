-- Tier C Phase 5: Customer portal — external users scoped to a CRM partner.
begin;

create table if not exists public.portal_users (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id),
  email varchar(255) not null,
  display_name varchar(255) not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists idx_portal_users_partner
  on public.portal_users (tenant_id, partner_id);

create table if not exists public.portal_magic_links (
  id bigserial primary key,
  portal_user_id bigint not null references public.portal_users(id) on delete cascade,
  token varchar(64) not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token)
);

create index if not exists idx_portal_magic_links_user
  on public.portal_magic_links (portal_user_id, expires_at desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('portal', 'Customer Portal', 'tenant', false, true, 37)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('portal', 'sales_order'),
  ('portal', 'sales'),
  ('portal', 'support')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'portal', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('portal', 'portal', null, 'Customer Portal (module)', 0),
  ('portal.users', 'portal', 'users', 'Portal Users', 10)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'portal'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
