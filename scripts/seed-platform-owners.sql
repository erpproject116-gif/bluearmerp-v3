-- Bluearm ERP v3 — primary tenant + default platform superadmins
-- Run AFTER supabase/seed.sql (requires module_registry + tenants table).
-- Does NOT require Supabase Auth users yet (link via scripts/link-platform-owners.sql).

begin;

insert into public.tenants (
  company_name,
  company_code,
  industry_type,
  email,
  phone,
  address,
  country,
  timezone,
  currency,
  status,
  auto_enable_all_modules
) values (
  'Bluearm Philippines',
  'BLUEARM',
  'erp_platform',
  'bluearmph@gmail.com',
  null,
  'Philippines',
  'PH',
  'Asia/Manila',
  'PHP',
  'active',
  true
) on conflict (company_code) do update
set
  auto_enable_all_modules = true,
  status = 'active',
  updated_at = now();

select public.enable_all_modules_for_tenant(t.id)
from public.tenants t
where t.company_code = 'BLUEARM';

insert into public.users (tenant_id, email, full_name, status)
select t.id, v.email, v.full_name, 'active'
from public.tenants t
cross join (
  values
    ('itsjohnranel@gmail.com', 'John Ranel'),
    ('bluearmph@gmail.com', 'Bluearm PH'),
    ('erpproject116@gmail.com', 'ERP Project')
) as v(email, full_name)
where t.company_code = 'BLUEARM'
on conflict (tenant_id, email) do update
set full_name = excluded.full_name, status = 'active', updated_at = now();

update public.tenants t
set owner_user_id = u.id, updated_at = now()
from public.users u
where t.company_code = 'BLUEARM'
  and u.tenant_id = t.id
  and lower(u.email) = 'bluearmph@gmail.com'
  and t.owner_user_id is distinct from u.id;

commit;
