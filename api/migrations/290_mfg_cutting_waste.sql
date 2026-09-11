-- Cutting Phase 2: output classification, waste reasons, WO waste lines.
begin;

alter table public.mfg_bom_lines
  add column if not exists output_classification varchar(20) not null default 'finished';

alter table public.mfg_bom_lines
  drop constraint if exists mfg_bom_lines_output_classification_chk;
alter table public.mfg_bom_lines
  add constraint mfg_bom_lines_output_classification_chk
  check (output_classification in ('finished', 'byproduct', 'rework', 'waste'));

create table if not exists public.mfg_waste_reasons (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(200) not null,
  is_abnormal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_mfg_waste_reasons_tenant
  on public.mfg_waste_reasons (tenant_id, is_active);

create table if not exists public.mfg_wo_waste_lines (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  component_item_id bigint references public.inv_items(id) on delete set null,
  classification varchar(20) not null default 'waste',
  qty numeric(18,6) not null default 0,
  expected_qty numeric(18,6) not null default 0,
  waste_reason_id bigint references public.mfg_waste_reasons(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint mfg_wo_waste_lines_qty_nonneg check (qty >= 0),
  constraint mfg_wo_waste_lines_expected_nonneg check (expected_qty >= 0),
  constraint mfg_wo_waste_lines_class_chk
    check (classification in ('finished', 'byproduct', 'rework', 'waste'))
);

create index if not exists idx_mfg_wo_waste_lines_wo
  on public.mfg_wo_waste_lines (tenant_id, work_order_id);

commit;
