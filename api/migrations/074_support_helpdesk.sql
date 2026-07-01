-- Tier C: Support / Helpdesk MVP — customer tickets linked to CRM partners and warranty assets.
begin;

create table if not exists public.sup_support_tickets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  ticket_date date not null default current_date,
  date_seq int not null default 1,
  ticket_no varchar(30) not null,
  subject varchar(500) not null,
  description text,
  partner_id bigint not null references public.inv_partners(id),
  warranty_asset_id bigint references public.crm_warranty_assets(id) on delete set null,
  repair_order_id bigint references public.inv_repair_orders(id) on delete set null,
  category varchar(80) not null default 'general',
  priority varchar(20) not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status varchar(20) not null default 'open'
    check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_user_id bigint references public.users(id),
  created_by_user_id bigint references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ticket_no)
);

create index if not exists idx_sup_support_tickets_list
  on public.sup_support_tickets (tenant_id, status, ticket_date desc);

create index if not exists idx_sup_support_tickets_partner
  on public.sup_support_tickets (tenant_id, partner_id);

create table if not exists public.sup_support_ticket_comments (
  id bigserial primary key,
  ticket_id bigint not null references public.sup_support_tickets(id) on delete cascade,
  user_id bigint references public.users(id),
  author_name varchar(255) not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sup_support_ticket_comments_ticket
  on public.sup_support_ticket_comments (ticket_id, created_at);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('support', 'Support', 'tenant', false, true, 36)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('support', 'crm')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'support', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('support', 'support', null, 'Support (module)', 0),
  ('support.tickets', 'support', 'tickets', 'Support Tickets', 10),
  ('support.tickets_new', 'support', 'tickets_new', 'New Ticket', 20),
  ('support.tickets_assign', 'support', 'tickets_assign', 'Assign Tickets', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'support'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
