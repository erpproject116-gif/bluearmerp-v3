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

-- Roles + tax/currency/base location before users and transactional demo seeds.
select public.seed_tenant_defaults(t.id)
from public.tenants t
where t.company_code = 'DEMO000';

select public.seed_tenant_base_config(t.id)
from public.tenants t
where t.company_code = 'DEMO000';

-- Buy + finance modules (and serial/lot feature) so demo-smoke can exercise those routes.
insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, m.module_code, true
from public.tenants t
cross join (
  values
    ('core'),
    ('inventory'),
    ('inventory.serial_lot'),
    ('quotation'),
    ('quotation.tax_mngt'),
    ('user_management'),
    ('sales_order'),
    ('sales'),
    ('purchase_request'),
    ('purchase_order'),
    ('purchases'),
    ('finance')
) as m(module_code)
where t.company_code = 'DEMO000'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.users (tenant_id, email, full_name, status, tenant_role)
select t.id, 'demo@demo.bluearm.local', 'Demo Owner', 'active', 'store_admin'
from public.tenants t
where t.company_code = 'DEMO000'
on conflict (tenant_id, email) do update
set
  full_name = excluded.full_name,
  status = excluded.status,
  tenant_role = excluded.tenant_role;

update public.tenants t
set owner_user_id = u.id
from public.users u
where t.company_code = 'DEMO000'
  and u.email = 'demo@demo.bluearm.local'
  and u.tenant_id = t.id
  and t.owner_user_id is distinct from u.id;

commit;
