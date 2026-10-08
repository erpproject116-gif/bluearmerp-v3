-- Spare parts issued from a repair order. Stock rows survive the line delete-and-insert.
begin;

alter table public.inv_repair_order_lines
  add column if not exists line_role text not null default 'unit',
  add column if not exists part_key text,
  add column if not exists location_id bigint references public.inv_locations(id),
  add column if not exists serial_unit_id bigint references public.inv_serial_units(id),
  add column if not exists lot_no varchar(255);

alter table public.inv_repair_order_lines
  drop constraint if exists inv_repair_order_lines_line_role_check;
alter table public.inv_repair_order_lines
  add constraint inv_repair_order_lines_line_role_check
  check (line_role in ('unit', 'part'));

create table if not exists public.inv_repair_part_issues (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  repair_order_id bigint not null references public.inv_repair_orders(id),
  part_key text not null,
  item_id bigint not null references public.inv_items(id),
  location_id bigint not null references public.inv_locations(id),
  direction text not null check (direction in ('issue', 'return')),
  qty numeric(18,4) not null check (qty > 0),
  serial_unit_id bigint references public.inv_serial_units(id),
  lot_no varchar(255),
  unit_cost numeric(18,4) not null default 0,
  journal_entry_id bigint references public.fin_journal_entries(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_repair_part_issues_order
  on public.inv_repair_part_issues (repair_order_id, part_key);

alter table public.inv_serial_events
  drop constraint if exists inv_serial_events_event_type_check;
alter table public.inv_serial_events
  add constraint inv_serial_events_event_type_check
  check (event_type in (
    'received', 'transferred', 'reserved', 'released', 'sold', 'returned', 'adjusted', 'voided',
    'generated', 'rma_receive', 'rma_release', 'repair_issue', 'repair_return'
  ));

insert into public.fin_accounts (
  tenant_id, account_code, account_name, account_type, is_group, is_system, sort_order, parent_id
)
select t.id, '5280', 'Warranty Expense', 'expense', false, true, 5280, parent.id
from public.tenants t
left join public.fin_accounts parent
  on parent.tenant_id = t.id and parent.account_code = '5095' and parent.deleted_at is null
where not exists (
  select 1 from public.fin_accounts existing
  where existing.tenant_id = t.id and existing.account_code = '5280'
)
on conflict (tenant_id, account_code) do nothing;

commit;
