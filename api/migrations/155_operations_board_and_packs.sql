-- Operations Hub: editable board columns + tenant industry packs.
begin;

-- Phase A: board column config
alter table public.wm_columns
  add column if not exists is_done boolean not null default false,
  add column if not exists wip_limit int,
  add column if not exists archived_at timestamptz;

-- Mark existing "done" keys as done columns where obvious
update public.wm_columns
set is_done = true
where archived_at is null
  and lower(column_key) in ('done', 'closed', 'complete', 'completed');

-- Phase B: industry packs as data
create table if not exists public.ops_packs (
  id bigserial primary key,
  tenant_id bigint references public.tenants(id) on delete cascade,
  pack_code varchar(80) not null,
  pack_name varchar(255) not null,
  description text,
  source_pack_code varchar(80),
  is_system boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, pack_code)
);

-- Platform packs use tenant_id null; enforce unique pack_code among platform rows
create unique index if not exists idx_ops_packs_platform_code
  on public.ops_packs (pack_code)
  where tenant_id is null and deleted_at is null;

create index if not exists idx_ops_packs_tenant
  on public.ops_packs (tenant_id, pack_name)
  where deleted_at is null;

create table if not exists public.ops_pack_columns (
  id bigserial primary key,
  pack_id bigint not null references public.ops_packs(id) on delete cascade,
  column_key varchar(50) not null,
  column_name varchar(255) not null,
  sort_order int not null default 0,
  column_color varchar(20),
  is_done boolean not null default false,
  wip_limit int,
  unique (pack_id, column_key)
);

create table if not exists public.ops_pack_sample_items (
  id bigserial primary key,
  pack_id bigint not null references public.ops_packs(id) on delete cascade,
  title varchar(500) not null,
  column_key varchar(50) not null,
  priority varchar(20) not null default 'normal',
  start_date_offset_days int not null default 0,
  end_date_offset_days int not null default 0,
  sort_order int not null default 0
);

create table if not exists public.ops_pack_automation_rules (
  id bigserial primary key,
  pack_id bigint not null references public.ops_packs(id) on delete cascade,
  rule_name varchar(255) not null,
  trigger_event varchar(80) not null,
  trigger_config jsonb not null default '{}'::jsonb,
  action_type varchar(80) not null,
  action_config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table if not exists public.ops_pack_dashboard_widgets (
  id bigserial primary key,
  pack_id bigint not null references public.ops_packs(id) on delete cascade,
  widget_type varchar(50) not null,
  title varchar(255) not null,
  config jsonb not null default '{}'::jsonb,
  grid_x int not null default 0,
  grid_y int not null default 0,
  grid_w int not null default 4,
  grid_h int not null default 2,
  sort_order int not null default 0
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('operations.packs', 'operations', 'packs', 'Industry Packs', 25),
  ('operations.board_config', 'operations', 'board_config', 'Board Configuration', 26)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.permission_code in ('operations.packs', 'operations.board_config')
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
