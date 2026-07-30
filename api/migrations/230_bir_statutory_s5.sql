-- Phase S5: Enterprise slices — bank match rules, JE dimensions, amount-threshold approvals
begin;

alter table public.fin_journal_entry_lines
  add column if not exists dept_id bigint references public.hr_departments(id) on delete set null,
  add column if not exists project_id bigint references public.inv_projects(id) on delete set null;

create table if not exists public.fin_bank_match_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  description_contains text not null,
  suggest_type text not null check (suggest_type in ('official_receipt', 'payment_voucher', 'expense')),
  suggest_category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_bank_match_rules_tenant
  on public.fin_bank_match_rules (tenant_id)
  where is_active;

create table if not exists public.fin_approval_amount_policies (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('payment_voucher', 'expense')),
  threshold_amount numeric(18,4) not null check (threshold_amount > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_type)
);

commit;
