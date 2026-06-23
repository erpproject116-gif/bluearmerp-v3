-- Sales team CRM scope: store admin sees all + analytics; sales team sees only assigned records.
begin;

alter table public.tenant_roles
  add column if not exists can_view_all_crm boolean not null default false,
  add column if not exists can_manage_sales_team boolean not null default false,
  add column if not exists can_view_crm_analytics boolean not null default false;

-- Store admin: full CRM visibility, assignment, and analytics.
update public.tenant_roles
set
  can_view_all_crm = true,
  can_manage_sales_team = true,
  can_view_crm_analytics = true
where role_code = 'store_admin';

-- Member role = sales team: scoped CRM (can_view_crm from 018); no tenant-wide analytics.
update public.tenant_roles
set
  role_name = 'Sales Team',
  description = 'Sales team members see only their assigned quotations, sales, and warranty work.'
where role_code = 'member';

commit;
