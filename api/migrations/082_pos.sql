-- Tier C: POS MVP — register sessions, cart, tenders; checkout creates simplified sale + stock movement.
begin;

create table if not exists public.pos_sessions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  session_no varchar(30) not null,
  location_id bigint not null references public.inv_locations(id),
  cashier_user_id bigint not null references public.users(id),
  status varchar(20) not null default 'open'
    check (status in ('open', 'closed')),
  opening_cash numeric(18,4) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(18,4),
  sales_total numeric(18,4) not null default 0 check (sales_total >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, session_no)
);

create index if not exists idx_pos_sessions_list
  on public.pos_sessions (tenant_id, status, opened_at desc);

create index if not exists idx_pos_sessions_cashier_open
  on public.pos_sessions (tenant_id, cashier_user_id)
  where status = 'open';

create table if not exists public.pos_cart_lines (
  id bigserial primary key,
  session_id bigint not null references public.pos_sessions(id) on delete cascade,
  line_no int not null,
  item_id bigint not null references public.inv_items(id),
  item_code varchar(20) not null default '',
  item_name varchar(500) not null default '',
  qty numeric(18,4) not null check (qty > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  line_total numeric(18,4) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, line_no)
);

create index if not exists idx_pos_cart_lines_session
  on public.pos_cart_lines (session_id, line_no);

create table if not exists public.pos_tenders (
  id bigserial primary key,
  session_id bigint not null references public.pos_sessions(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id) on delete cascade,
  tender_type varchar(20) not null default 'cash'
    check (tender_type in ('cash', 'card', 'other')),
  amount numeric(18,4) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_tenders_session
  on public.pos_tenders (session_id, created_at);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('pos', 'POS', 'tenant', false, true, 39)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('pos', 'inventory'), ('pos', 'sales')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'pos', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('pos', 'pos', null, 'POS (module)', 0),
  ('pos.terminal', 'pos', 'terminal', 'POS Terminal', 10),
  ('pos.sessions', 'pos', 'sessions', 'POS Sessions', 20),
  ('pos.checkout', 'pos', 'checkout', 'POS Checkout', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'pos'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
