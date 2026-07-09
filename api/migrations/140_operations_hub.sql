-- Phase 4 Operations Hub foundation (PM-1 through PM-6).
begin;

create table if not exists public.wm_workspaces (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  workspace_code varchar(30) not null,
  workspace_name varchar(255) not null,
  industry_pack varchar(50),
  inv_project_id bigint references public.inv_projects(id) on delete set null,
  job_cost_project_id bigint references public.job_cost_projects(id) on delete set null,
  status varchar(20) not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workspace_code)
);

create index if not exists idx_wm_workspaces_list
  on public.wm_workspaces (tenant_id, status, workspace_name);

create table if not exists public.wm_columns (
  id bigserial primary key,
  workspace_id bigint not null references public.wm_workspaces(id) on delete cascade,
  column_key varchar(50) not null,
  column_name varchar(255) not null,
  sort_order int not null default 0,
  column_color varchar(20),
  created_at timestamptz not null default now(),
  unique (workspace_id, column_key)
);

create index if not exists idx_wm_columns_workspace
  on public.wm_columns (workspace_id, sort_order);

create table if not exists public.wm_work_items (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  workspace_id bigint not null references public.wm_workspaces(id) on delete cascade,
  column_id bigint not null references public.wm_columns(id),
  item_code varchar(30),
  title varchar(500) not null,
  description text,
  status varchar(20) not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'blocked')),
  priority varchar(20) not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_user_id bigint references public.users(id) on delete set null,
  partner_id bigint references public.inv_partners(id) on delete set null,
  start_date date,
  end_date date,
  blocked_by_item_id bigint references public.wm_work_items(id) on delete set null,
  sort_order int not null default 0,
  quotation_id bigint references public.quo_quotations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wm_work_items_workspace
  on public.wm_work_items (workspace_id, column_id, sort_order);

create index if not exists idx_wm_work_items_calendar
  on public.wm_work_items (tenant_id, workspace_id, start_date, end_date);

create table if not exists public.wm_links (
  id bigserial primary key,
  work_item_id bigint not null references public.wm_work_items(id) on delete cascade,
  link_type varchar(50) not null,
  doc_type varchar(80) not null,
  doc_id bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wm_links_work_item
  on public.wm_links (work_item_id);

create index if not exists idx_wm_links_doc
  on public.wm_links (doc_type, doc_id);

create table if not exists public.wm_automation_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  workspace_id bigint references public.wm_workspaces(id) on delete cascade,
  rule_name varchar(255) not null,
  trigger_event varchar(80) not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_type varchar(80) not null,
  action_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wm_automation_rules_workspace
  on public.wm_automation_rules (tenant_id, workspace_id, is_active);

create table if not exists public.wm_dashboards (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  workspace_id bigint references public.wm_workspaces(id) on delete cascade,
  dashboard_name varchar(255) not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wm_dashboards_workspace
  on public.wm_dashboards (tenant_id, workspace_id);

create table if not exists public.wm_dashboard_widgets (
  id bigserial primary key,
  dashboard_id bigint not null references public.wm_dashboards(id) on delete cascade,
  widget_type varchar(50) not null,
  title varchar(255) not null,
  config jsonb not null default '{}'::jsonb,
  grid_x int not null default 0,
  grid_y int not null default 0,
  grid_w int not null default 4,
  grid_h int not null default 2,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_wm_dashboard_widgets_dashboard
  on public.wm_dashboard_widgets (dashboard_id, sort_order);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('operations', 'Operations Hub', 'tenant', false, true, 40)
on conflict (module_code) do update
set module_name = excluded.module_name,
    sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values
  ('operations', 'inventory'),
  ('operations', 'job_costing')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'operations', true
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('operations', 'operations', null, 'Operations Hub (module)', 0),
  ('operations.workspaces', 'operations', 'workspaces', 'Workspaces', 10),
  ('operations.workspaces_new', 'operations', 'workspaces_new', 'New Workspace', 20),
  ('operations.work_items', 'operations', 'work_items', 'Work Items', 30),
  ('operations.work_items_new', 'operations', 'work_items_new', 'New Work Item', 40),
  ('operations.automation', 'operations', 'automation', 'Automation Rules', 50),
  ('operations.dashboard', 'operations', 'dashboard', 'Dashboards', 60),
  ('operations.create_quotation', 'operations', 'create_quotation', 'Create Quotation from Work Item', 70)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'operations'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
