-- Tier C: Job Costing MVP — project budgets, timesheets, budget vs actual.
begin;

create table if not exists public.job_cost_projects (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  project_code varchar(30) not null,
  project_name varchar(255) not null,
  partner_id bigint references public.inv_partners(id),
  inv_project_id bigint references public.inv_projects(id) on delete set null,
  status varchar(20) not null default 'active'
    check (status in ('active', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_code)
);

create index if not exists idx_job_cost_projects_list
  on public.job_cost_projects (tenant_id, status, project_name);

create table if not exists public.job_cost_budget_lines (
  id bigserial primary key,
  project_id bigint not null references public.job_cost_projects(id) on delete cascade,
  line_no int not null,
  category varchar(50) not null default 'other'
    check (category in ('labor', 'materials', 'overhead', 'other')),
  description varchar(500) not null default '',
  budget_amount numeric(18,4) not null default 0 check (budget_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, line_no)
);

create index if not exists idx_job_cost_budget_lines_project
  on public.job_cost_budget_lines (project_id, line_no);

create table if not exists public.job_cost_timesheets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.job_cost_projects(id) on delete cascade,
  user_id bigint references public.users(id),
  worker_name varchar(255) not null default '',
  work_date date not null default current_date,
  hours numeric(10,2) not null check (hours > 0),
  hourly_rate numeric(18,4) not null default 0 check (hourly_rate >= 0),
  cost_amount numeric(18,4) not null default 0 check (cost_amount >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_cost_timesheets_project
  on public.job_cost_timesheets (tenant_id, project_id, work_date desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('job_costing', 'Job Costing', 'tenant', false, true, 38)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('job_costing', 'finance')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'job_costing', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('job_costing', 'job_costing', null, 'Job Costing (module)', 0),
  ('job_costing.projects', 'job_costing', 'projects', 'Job Cost Projects', 10),
  ('job_costing.projects_new', 'job_costing', 'projects_new', 'New Job Cost Project', 20),
  ('job_costing.budget', 'job_costing', 'budget', 'Project Budget', 30),
  ('job_costing.timesheets', 'job_costing', 'timesheets', 'Timesheets', 40),
  ('job_costing.budget_vs_actual', 'job_costing', 'budget_vs_actual', 'Budget vs Actual', 50)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'job_costing'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
