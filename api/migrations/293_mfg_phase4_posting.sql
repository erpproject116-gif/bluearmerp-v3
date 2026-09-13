-- Manufacturing Phase 4: immutable cost postings and post-complete reversals.
begin;

create table if not exists public.mfg_work_order_cost_inputs (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id) on delete cascade,
  labor_cost numeric(18,4) not null default 0 check (labor_cost >= 0),
  overhead_cost numeric(18,4) not null default 0 check (overhead_cost >= 0),
  other_cost numeric(18,4) not null default 0 check (other_cost >= 0),
  updated_by_user_id bigint references public.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, work_order_id)
);

create table if not exists public.mfg_work_order_cost_postings (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id),
  material_cost numeric(18,4) not null default 0 check (material_cost >= 0),
  labor_cost numeric(18,4) not null default 0 check (labor_cost >= 0),
  overhead_cost numeric(18,4) not null default 0 check (overhead_cost >= 0),
  other_cost numeric(18,4) not null default 0 check (other_cost >= 0),
  total_cost numeric(18,4) not null default 0 check (total_cost >= 0),
  journal_entry_id bigint references public.fin_journal_entries(id) on delete set null,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, work_order_id)
);

create table if not exists public.mfg_work_order_reversals (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  work_order_id bigint not null references public.mfg_work_orders(id),
  reason text,
  journal_entry_id bigint references public.fin_journal_entries(id) on delete set null,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, work_order_id)
);

create index if not exists idx_mfg_wo_cost_postings_je
  on public.mfg_work_order_cost_postings (journal_entry_id)
  where journal_entry_id is not null;

create index if not exists idx_mfg_wo_reversals_je
  on public.mfg_work_order_reversals (journal_entry_id)
  where journal_entry_id is not null;

commit;
