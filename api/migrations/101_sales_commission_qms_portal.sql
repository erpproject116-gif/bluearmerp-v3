-- Sales commission, QMS CAPA, vendor portal permissions
begin;

create table if not exists public.sa_commission_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name text not null,
  salesperson_user_id bigint references public.users(id),
  item_category_id bigint references public.inv_item_categories(id),
  rate_pct numeric(8,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sa_commission_accruals (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rule_id bigint references public.sa_commission_rules(id) on delete set null,
  sales_id bigint not null references public.sa_sales(id),
  salesperson_user_id bigint references public.users(id),
  base_amount numeric(18,4) not null default 0,
  commission_amount numeric(18,4) not null default 0,
  status text not null default 'accrued',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qms_capa_records (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  ncr_id bigint references public.qms_ncrs(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open',
  assigned_user_id bigint references public.users(id),
  due_date date,
  closed_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('portal.vendor_read', 'portal', 'vendor_read', 'Vendor portal PO read', 20),
  ('sales.commission_read', 'sales', 'commission_read', 'Sales commission (read)', 90),
  ('sales.commission_write', 'sales', 'commission_write', 'Sales commission (write)', 91),
  ('quality.capa_read', 'quality', 'capa_read', 'CAPA (read)', 20),
  ('quality.capa_write', 'quality', 'capa_write', 'CAPA (write)', 21)
on conflict (permission_code) do nothing;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('sales_commission', 'Sales Commission', 'tenant', false, true, 12)
on conflict (module_code) do update set module_name = excluded.module_name;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, v.code, false from public.tenants t
cross join (values ('sales_commission')) as v(code)
on conflict (tenant_id, module_code) do nothing;

commit;
