-- Seed system roles + default permissions whenever a new tenant row is created.
-- Application code also calls the same logic via provision.SeedTenantDefaults for
-- environments that provision tenants outside Postgres triggers.
begin;

create or replace function public.seed_tenant_defaults(p_tenant_id bigint)
returns void
language plpgsql
as $$
begin
  insert into public.tenant_roles (
    tenant_id, role_code, role_name, description, is_system,
    can_manage_users, can_manage_form_settings, sort_order
  )
  values
    (p_tenant_id, 'member', 'Sales Team',
     'Sales team members see only their assigned quotations, sales, and warranty work.',
     true, false, false, 10),
    (p_tenant_id, 'store_admin', 'Store Admin',
     'Can manage users and form settings',
     true, true, true, 20)
  on conflict (tenant_id, role_code) do nothing;

  update public.tenant_roles
  set can_view_all_crm = true,
      can_manage_sales_team = true,
      can_view_crm_analytics = true,
      updated_at = now()
  where tenant_id = p_tenant_id and role_code = 'store_admin';

  insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
  select p_tenant_id, 'store_admin', pr.permission_code, 'write'
  from public.permission_registry pr
  on conflict (tenant_id, role_code, permission_code) do update
    set access_level = excluded.access_level;

  insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
  select p_tenant_id, 'member', pr.permission_code,
    case
      when pr.module_code in ('user_management') or pr.permission_code like 'settings.%' then 'deny'
      when pr.module_code = 'activity_logs' then 'deny'
      when pr.module_code = 'finance' then 'deny'
      when pr.permission_code in (
        'crm.reports_customer_quotations', 'crm.reports_item_demand',
        'crm.reports_conversion', 'crm.reports_low_stock', 'crm.settings_alert_rules'
      ) then 'deny'
      when pr.feature_key is null then 'read'
      else 'read'
    end
  from public.permission_registry pr
  on conflict (tenant_id, role_code, permission_code) do update
    set access_level = excluded.access_level;
end;
$$;

-- Backfill any tenants created before role seeding ran at provision time.
do $$
declare
  tid bigint;
begin
  for tid in
    select t.id
    from public.tenants t
    where not exists (
      select 1 from public.tenant_roles tr
      where tr.tenant_id = t.id and tr.role_code = 'store_admin'
    )
  loop
    perform public.seed_tenant_defaults(tid);
  end loop;
end;
$$;

commit;
