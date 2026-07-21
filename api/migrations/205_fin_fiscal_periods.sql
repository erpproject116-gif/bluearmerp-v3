-- Monthly fiscal periods for period-level posting locks.
begin;

create table if not exists public.fin_fiscal_periods (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  fiscal_year_id bigint not null references public.fin_fiscal_years(id) on delete cascade,
  period_code varchar(20) not null,
  period_name varchar(100) not null,
  start_date date not null,
  end_date date not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_code),
  unique (tenant_id, fiscal_year_id, start_date),
  check (end_date >= start_date)
);

create index if not exists idx_fin_fiscal_periods_tenant_dates
  on public.fin_fiscal_periods (tenant_id, start_date, end_date);

create index if not exists idx_fin_fiscal_periods_year
  on public.fin_fiscal_periods (fiscal_year_id, start_date);

-- Backfill calendar months for existing fiscal years (clipped to year bounds).
insert into public.fin_fiscal_periods (
  tenant_id, fiscal_year_id, period_code, period_name, start_date, end_date, is_closed
)
select
  fy.tenant_id,
  fy.id,
  to_char(gs, 'YYYY-MM'),
  to_char(gs, 'Mon YYYY'),
  greatest(fy.start_date, gs::date),
  least(fy.end_date, (gs + interval '1 month - 1 day')::date),
  fy.is_closed
from public.fin_fiscal_years fy
cross join lateral generate_series(
  date_trunc('month', fy.start_date)::timestamp,
  date_trunc('month', fy.end_date)::timestamp,
  interval '1 month'
) as gs
on conflict (tenant_id, period_code) do nothing;

commit;
