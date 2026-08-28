-- WO serial/lot issue and FG output staging (production trace).
begin;

create table if not exists public.mfg_wo_issue_serials (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  component_item_id bigint not null references public.inv_items(id),
  serial_unit_id bigint not null references public.inv_serial_units(id),
  created_at timestamptz not null default now(),
  unique (work_order_id, serial_unit_id)
);

create index if not exists idx_mfg_wo_issue_serials_wo
  on public.mfg_wo_issue_serials (work_order_id);

create table if not exists public.mfg_wo_issue_lots (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  component_item_id bigint not null references public.inv_items(id),
  lot_batch_id bigint not null references public.inv_lot_batches(id),
  qty numeric(18,4) not null check (qty > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_mfg_wo_issue_lots_wo
  on public.mfg_wo_issue_lots (work_order_id);

create table if not exists public.mfg_wo_output_serials (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  serial_no varchar(100) not null,
  client_scan_id varchar(64),
  status varchar(20) not null default 'staged'
    check (status in ('staged', 'posted', 'void')),
  created_at timestamptz not null default now(),
  unique (tenant_id, work_order_id, client_scan_id)
);

create index if not exists idx_mfg_wo_output_serials_wo
  on public.mfg_wo_output_serials (work_order_id, status);

create table if not exists public.mfg_wo_output_lots (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  lot_no varchar(100) not null,
  qty numeric(18,4) not null check (qty > 0),
  expiry_date date,
  catch_weight numeric(18,4),
  client_scan_id varchar(64),
  status varchar(20) not null default 'staged'
    check (status in ('staged', 'posted', 'void')),
  created_at timestamptz not null default now(),
  unique (tenant_id, work_order_id, client_scan_id)
);

create index if not exists idx_mfg_wo_output_lots_wo
  on public.mfg_wo_output_lots (work_order_id, status);

commit;
