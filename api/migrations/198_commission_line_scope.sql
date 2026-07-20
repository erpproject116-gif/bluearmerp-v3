-- Flexible sale commissions: per-transaction or per sale line (item).
alter table public.sa_sales_commission_lines
  add column if not exists scope text not null default 'transaction';

alter table public.sa_sales_commission_lines
  add column if not exists sales_line_id bigint null;

alter table public.sa_sales_commission_lines
  add column if not exists sales_line_no int null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sa_sales_commission_lines_scope_check'
  ) then
    alter table public.sa_sales_commission_lines
      add constraint sa_sales_commission_lines_scope_check
      check (scope in ('transaction', 'item'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sa_sales_commission_lines_sales_line_id_fkey'
  ) then
    alter table public.sa_sales_commission_lines
      add constraint sa_sales_commission_lines_sales_line_id_fkey
      foreign key (sales_line_id) references public.sa_sales_lines(id) on delete set null;
  end if;
end $$;

create index if not exists idx_sa_sales_commission_lines_sales_line
  on public.sa_sales_commission_lines (tenant_id, sales_line_id)
  where sales_line_id is not null;

comment on column public.sa_sales_commission_lines.scope is
  'transaction = %/fixed of invoice grand total; item = %/fixed of one sale line total';
