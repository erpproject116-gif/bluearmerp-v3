-- Bluearm ERP v3 — catalog + DEMO000 tenant (no inventory rows)
begin;

insert into public.tenants (
  company_name, company_code, industry_type, email, phone, address, country, timezone, currency, status
) values (
  'Pacific Rim Modular Furnishing Corp.',
  'DEMO000',
  'light_manufacturing',
  'ops@demo.bluearm.local',
  '+6346-437-8800',
  'Lot 14 Block 3, Cavite Economic Zone, Rosario, Cavite 4106, Philippines',
  'PH',
  'Asia/Manila',
  'PHP',
  'active'
) on conflict (company_code) do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, m.module_code, true
from public.tenants t
cross join (values ('core'), ('inventory'), ('quotation'), ('user_management'), ('sales_order')) as m(module_code)
where t.company_code = 'DEMO000'
on conflict (tenant_id, module_code) do update set is_enabled = true;

insert into public.users (tenant_id, email, full_name, status)
select t.id, 'demo@demo.bluearm.local', 'Demo Owner', 'active'
from public.tenants t
where t.company_code = 'DEMO000'
on conflict (tenant_id, email) do nothing;

update public.tenants t
set owner_user_id = u.id
from public.users u
where t.company_code = 'DEMO000'
  and u.email = 'demo@demo.bluearm.local'
  and u.tenant_id = t.id
  and t.owner_user_id is distinct from u.id;

commit;
