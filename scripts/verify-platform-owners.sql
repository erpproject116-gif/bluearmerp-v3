-- Verify BLUEARM platform owners and module access flags
select
  t.company_code,
  t.company_name,
  t.auto_enable_all_modules,
  t.owner_user_id,
  owner_u.email as owner_email,
  u.email as user_email,
  u.auth_user_id is not null as auth_linked,
  pu.role as platform_role,
  pu.is_active as platform_active
from public.tenants t
join public.users u on u.tenant_id = t.id
left join public.users owner_u on owner_u.id = t.owner_user_id
left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
where t.company_code = 'BLUEARM'
order by u.email;

select tm.module_code, tm.is_enabled
from public.tenant_modules tm
join public.tenants t on t.id = tm.tenant_id
where t.company_code = 'BLUEARM'
order by tm.module_code;
