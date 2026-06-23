-- Module/feature permission matrix: read, write, or deny per role and per-user override.
begin;

create table if not exists public.permission_registry (
  permission_code varchar(120) primary key,
  module_code varchar(50) not null,
  feature_key varchar(80),
  label varchar(200) not null,
  sort_order int not null default 0
);

create table if not exists public.tenant_role_permissions (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  role_code varchar(50) not null,
  permission_code varchar(120) not null references public.permission_registry(permission_code) on delete cascade,
  access_level varchar(10) not null,
  primary key (tenant_id, role_code, permission_code),
  constraint tenant_role_permissions_access_check
    check (access_level in ('deny', 'read', 'write')),
  constraint tenant_role_permissions_role_fkey
    foreign key (tenant_id, role_code) references public.tenant_roles(tenant_id, role_code) on delete cascade
);

create index if not exists idx_tenant_role_permissions_tenant
  on public.tenant_role_permissions (tenant_id, role_code);

create table if not exists public.user_permission_overrides (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  permission_code varchar(120) not null references public.permission_registry(permission_code) on delete cascade,
  access_level varchar(10) not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, permission_code),
  constraint user_permission_overrides_access_check
    check (access_level in ('deny', 'read', 'write'))
);

create index if not exists idx_user_permission_overrides_user
  on public.user_permission_overrides (tenant_id, user_id);

-- Registry: modules + features (aligned with web shell navigation)
insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('inventory', 'inventory', null, 'Inventory (module)', 0),
  ('inventory.partners', 'inventory', 'partners', 'Partners', 10),
  ('inventory.locations', 'inventory', 'locations', 'Locations', 20),
  ('inventory.projects', 'inventory', 'projects', 'Projects', 30),
  ('inventory.departments', 'inventory', 'departments', 'Departments', 40),
  ('inventory.items', 'inventory', 'items', 'Items', 50),
  ('inventory.stock_movements', 'inventory', 'stock_movements', 'Stock Movements', 60),
  ('inventory.after_sales', 'inventory', 'after_sales', 'After-Sales (branch)', 70),
  ('inventory.after_sales.repair_orders', 'inventory', 'repair_orders', 'Repair Order List', 71),
  ('inventory.after_sales.repair_orders_new', 'inventory', 'repair_orders_new', 'New Repair Order', 72),
  ('inventory.after_sales.repair_orders_status', 'inventory', 'repair_orders_status', 'Repair Order Status', 73),
  ('inventory.after_sales.register_repair_new', 'inventory', 'register_repair_new', 'New Repair', 74),
  ('inventory.after_sales.register_repair', 'inventory', 'register_repair', 'Repair List', 75),
  ('inventory.after_sales.register_repair_status', 'inventory', 'register_repair_status', 'Repair Status', 76),
  ('inventory.after_sales.register_repair_consumption', 'inventory', 'register_repair_consumption', 'A/S Consumption Status', 77),
  ('quotation', 'quotation', null, 'Quotation (module)', 100),
  ('quotation.quotations_new', 'quotation', 'quotations_new', 'New Quotation', 110),
  ('quotation.quotations', 'quotation', 'quotations', 'Quotation List', 120),
  ('quotation.quotations_status', 'quotation', 'quotations_status', 'Quotation Status', 130),
  ('quotation.quotations_outstanding', 'quotation', 'quotations_outstanding', 'Outstanding Quote Status', 140),
  ('quotation.tax_types', 'quotation', 'tax_types', 'Tax Types', 150),
  ('quotation.currencies', 'quotation', 'currencies', 'Currencies', 160),
  ('sales_order', 'sales_order', null, 'Sales Order (module)', 200),
  ('sales_order.sales_orders_new', 'sales_order', 'sales_orders_new', 'New Sales Order', 210),
  ('sales_order.sales_orders', 'sales_order', 'sales_orders', 'Sales Order List', 220),
  ('sales_order.sales_orders_status', 'sales_order', 'sales_orders_status', 'Sales Order Status', 230),
  ('sales_order.sales_orders_outstanding', 'sales_order', 'sales_orders_outstanding', 'Outstanding SO Status', 240),
  ('sales_order.sales_orders_release', 'sales_order', 'sales_orders_release', 'Release Sales Order', 250),
  ('sales', 'sales', null, 'Sales (module)', 300),
  ('sales.sales_new', 'sales', 'sales_new', 'New Sales', 310),
  ('sales.sales', 'sales', 'sales', 'Sales List', 320),
  ('sales.sales_status', 'sales', 'sales_status', 'Sales Status', 330),
  ('sales.sales_pre_invoicing', 'sales', 'sales_pre_invoicing', 'Pre-invoicing Status', 340),
  ('sales.sales_price_batch', 'sales', 'sales_price_batch', 'Change Sales Price-Batch', 350),
  ('finance', 'finance', null, 'Finance (module)', 400),
  ('finance.official_receipts_new', 'finance', 'official_receipts_new', 'New Official Receipt', 410),
  ('finance.official_receipts', 'finance', 'official_receipts', 'Official Receipt List', 420),
  ('finance.reports_ar_by_customer', 'finance', 'reports_ar_by_customer', 'A/R by Customer', 430),
  ('finance.reports_receipt_status', 'finance', 'reports_receipt_status', 'Receipt Status', 440),
  ('crm', 'crm', null, 'CRM (module)', 500),
  ('crm.dashboard', 'crm', 'dashboard', 'CRM Dashboard', 510),
  ('crm.notifications', 'crm', 'notifications', 'Notifications', 520),
  ('crm.follow_up_tasks', 'crm', 'follow_up_tasks', 'Follow-up Tasks', 530),
  ('crm.pipelines_quotations', 'crm', 'pipelines_quotations', 'Quotation Pipeline', 540),
  ('crm.warranty_assets', 'crm', 'warranty_assets', 'Warranty Registry', 550),
  ('crm.reports_customer_quotations', 'crm', 'reports_customer_quotations', 'Customer × Item Report', 560),
  ('crm.reports_item_demand', 'crm', 'reports_item_demand', 'Item Demand Report', 570),
  ('crm.reports_conversion', 'crm', 'reports_conversion', 'Conversion Funnel', 580),
  ('crm.reports_low_stock', 'crm', 'reports_low_stock', 'Low Stock Report', 590),
  ('crm.settings_alert_rules', 'crm', 'settings_alert_rules', 'Alert Rules', 600),
  ('activity_logs', 'activity_logs', null, 'Activity Logs (module)', 700),
  ('activity_logs.logs', 'activity_logs', 'logs', 'Activity Logs', 710),
  ('activity_logs.changes', 'activity_logs', 'changes', 'Change Logs', 720),
  ('user_management', 'user_management', null, 'User Management (module)', 800),
  ('user_management.users', 'user_management', 'users', 'Users', 810),
  ('user_management.roles', 'user_management', 'roles', 'Roles', 820),
  ('settings.form_fields', 'user_management', 'form_fields', 'Form Field Settings', 830)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

-- Backfill store_admin: write on all permissions
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

-- Backfill member (Sales Team): read on operational modules, deny admin areas
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', pr.permission_code,
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
from public.tenants t
cross join public.permission_registry pr
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

-- Custom roles: default deny until configured
insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select tr.tenant_id, tr.role_code, pr.permission_code, 'deny'
from public.tenant_roles tr
cross join public.permission_registry pr
where tr.role_code not in ('member', 'store_admin')
on conflict (tenant_id, role_code, permission_code) do nothing;

commit;
