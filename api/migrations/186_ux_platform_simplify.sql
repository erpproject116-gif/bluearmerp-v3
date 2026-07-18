-- UX simplification + Platform Command Customer Success enhancements.
begin;

-- Product-gap tagging on support tickets (feeds Phase B/C backlog from CS).
alter table public.sup_support_tickets
  add column if not exists product_gap_tag varchar(80) not null default '',
  add column if not exists product_gap_note text not null default '';

create index if not exists idx_sup_tickets_product_gap
  on public.sup_support_tickets (product_gap_tag)
  where product_gap_tag <> '';

-- Assign CS owner on platform customers.
alter table public.platform_customers
  add column if not exists assigned_platform_user_id bigint
    references public.platform_users (id) on delete set null;

create index if not exists idx_platform_customers_assignee
  on public.platform_customers (assigned_platform_user_id)
  where assigned_platform_user_id is not null;

-- CS playbook progress per customer (Day 0 → go-live → payroll).
create table if not exists public.platform_cs_playbook_steps (
  id bigserial primary key,
  platform_customer_id bigint not null references public.platform_customers (id) on delete cascade,
  step_code varchar(60) not null,
  status varchar(20) not null default 'pending',
  notes text not null default '',
  completed_at timestamptz,
  completed_by_platform_user_id bigint references public.platform_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint platform_cs_playbook_status_check check (status in ('pending', 'done', 'skipped', 'auto')),
  constraint platform_cs_playbook_unique unique (platform_customer_id, step_code)
);

create index if not exists idx_platform_cs_playbook_customer
  on public.platform_cs_playbook_steps (platform_customer_id, status);

-- Follow-up SLA clock (hours from creation; overdue when due_at passed).
alter table public.platform_follow_up_tasks
  add column if not exists sla_hours int not null default 48;

commit;
