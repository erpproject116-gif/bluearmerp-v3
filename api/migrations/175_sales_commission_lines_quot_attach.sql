-- Per-sale commission lines (flexible % or fixed, multi TIC) + quotation attachments optional by default.
begin;

create table if not exists public.sa_sales_commission_lines (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  sales_id bigint not null references public.sa_sales(id) on delete cascade,
  line_no int not null default 1,
  -- Tech in charge / commission beneficiary (optional user link; name always stored for print).
  tic_user_id bigint references public.users(id) on delete set null,
  tic_name varchar(255) not null default '',
  calc_mode varchar(20) not null default 'percent'
    check (calc_mode in ('percent', 'fixed')),
  -- percent: rate_value is % of base; fixed: rate_value is absolute amount
  rate_value numeric(18,4) not null default 0 check (rate_value >= 0),
  base_amount numeric(18,4) not null default 0 check (base_amount >= 0),
  commission_amount numeric(18,4) not null default 0 check (commission_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (sales_id, line_no)
);

create index if not exists idx_sa_sales_commission_lines_sale
  on public.sa_sales_commission_lines (tenant_id, sales_id);

alter table public.sa_commission_accruals
  add column if not exists sale_commission_line_id bigint references public.sa_sales_commission_lines(id) on delete set null;

create unique index if not exists uq_sa_commission_accruals_sale_line
  on public.sa_commission_accruals (tenant_id, sales_id, sale_commission_line_id)
  where sale_commission_line_id is not null;

-- Product owner: quotation attachments are optional (not required).
alter table public.tenant_process_policies
  alter column quotation_require_attachment set default false;

update public.tenant_process_policies
set quotation_require_attachment = false
where quotation_require_attachment is distinct from false;

commit;
