-- CRM module: warranty registry, alert rules, notifications, follow-up tasks
begin;

alter table public.inv_items
  add column if not exists warranty_duration_months int check (warranty_duration_months is null or warranty_duration_months >= 0),
  add column if not exists reorder_level numeric(18,4) check (reorder_level is null or reorder_level >= 0);

alter table public.inv_item_location_balances
  add column if not exists reorder_level numeric(18,4) check (reorder_level is null or reorder_level >= 0);

alter table public.tenant_roles
  add column if not exists can_view_crm boolean not null default false,
  add column if not exists can_manage_crm_rules boolean not null default false;

create table if not exists public.crm_warranty_assets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id),
  item_id bigint references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  serial_no varchar(255) not null,
  sales_id bigint references public.sa_sales(id),
  sales_line_id bigint references public.sa_sales_lines(id),
  warranty_start date not null,
  warranty_end date not null,
  status text not null default 'active' check (status in ('active', 'expired', 'void')),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sales_line_id, serial_no)
);

create index if not exists idx_crm_warranty_assets_list
  on public.crm_warranty_assets (tenant_id, warranty_end, status);

create index if not exists idx_crm_warranty_assets_partner
  on public.crm_warranty_assets (tenant_id, partner_id);

create table if not exists public.crm_alert_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rule_type text not null check (rule_type in (
    'warranty_follow_up', 'quote_expiring', 'low_stock', 'quote_unconverted', 'custom_kpi'
  )),
  name varchar(255) not null,
  is_enabled boolean not null default true,
  lead_value int not null default 0,
  lead_unit text not null default 'days' check (lead_unit in ('days', 'months')),
  threshold_json jsonb not null default '{}',
  notify_role_codes text[] not null default '{}',
  notify_user_ids bigint[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rule_type, name)
);

create table if not exists public.crm_notifications (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint references public.users(id) on delete cascade,
  rule_id bigint references public.crm_alert_rules(id) on delete set null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title varchar(500) not null,
  body text not null default '',
  entity_type varchar(100),
  entity_id bigint,
  dedupe_key varchar(255),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create index if not exists idx_crm_notifications_inbox
  on public.crm_notifications (tenant_id, user_id, read_at, created_at desc);

create table if not exists public.crm_follow_up_tasks (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  task_type text not null default 'manual' check (task_type in (
    'warranty_follow_up', 'quote_follow_up', 'manual'
  )),
  stage text not null default 'scheduled' check (stage in (
    'scheduled', 'due_soon', 'overdue', 'completed', 'cancelled'
  )),
  due_date date not null,
  partner_id bigint references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  warranty_asset_id bigint references public.crm_warranty_assets(id) on delete set null,
  quotation_id bigint references public.quo_quotations(id) on delete set null,
  sales_id bigint references public.sa_sales(id) on delete set null,
  title varchar(500) not null default '',
  notes text,
  completed_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_follow_up_tasks_stage
  on public.crm_follow_up_tasks (tenant_id, stage, due_date);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('crm', 'CRM', 'tenant', false, true, 40)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('crm', 'quotation'),
  ('crm', 'sales_order'),
  ('crm', 'sales'),
  ('crm', 'inventory')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'crm', true
from public.tenants t
where t.auto_enable_all_modules = true
  and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

commit;
