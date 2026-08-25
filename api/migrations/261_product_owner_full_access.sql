-- Superadmins (itsjohnranel, bluearmph, erpproject116) get the same unrestricted
-- ERP + Platform Command access: BLUEARM store_admin + platform_users.superadmin.
-- bluearmph@gmail.com is also the store owner of every tenant they belong to.
begin;

select public.seed_tenant_defaults(t.id)
from public.tenants t
where t.company_code = 'BLUEARM';

update public.users u
set tenant_role = 'store_admin',
    status = 'active',
    updated_at = now()
from public.tenants t
where u.tenant_id = t.id
  and t.company_code = 'BLUEARM'
  and lower(u.email) in (
    'itsjohnranel@gmail.com',
    'bluearmph@gmail.com',
    'erpproject116@gmail.com'
  )
  and (u.tenant_role is distinct from 'store_admin' or u.status is distinct from 'active');

update public.users u
set tenant_role = 'store_admin',
    status = 'active',
    updated_at = now()
where lower(u.email) = 'bluearmph@gmail.com'
  and u.status in ('active', 'invited')
  and (u.tenant_role is distinct from 'store_admin' or u.status is distinct from 'active');

update public.tenants t
set owner_user_id = u.id, updated_at = now()
from public.users u
where lower(u.email) = 'bluearmph@gmail.com'
  and u.status = 'active'
  and t.id = u.tenant_id
  and t.owner_user_id is distinct from u.id;

insert into public.platform_users (auth_user_id, email, full_name, role, is_active)
select
  u.auth_user_id,
  lower(u.email),
  coalesce(nullif(trim(u.full_name), ''), u.email),
  'superadmin',
  true
from public.users u
join public.tenants t on t.id = u.tenant_id
where t.company_code = 'BLUEARM'
  and u.auth_user_id is not null
  and lower(u.email) in (
    'itsjohnranel@gmail.com',
    'bluearmph@gmail.com',
    'erpproject116@gmail.com'
  )
on conflict (auth_user_id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = 'superadmin',
    is_active = true;

commit;
