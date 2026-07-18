-- HR employee essentials: departments master, bank payout fields, check direction.
begin;

create table if not exists public.hr_departments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  department_code varchar(40) not null,
  department_name varchar(120) not null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, department_code)
);

create index if not exists idx_hr_departments_tenant_status
  on public.hr_departments (tenant_id, status);

alter table public.hr_employees
  add column if not exists department_id bigint references public.hr_departments(id) on delete set null,
  add column if not exists bank_name varchar(120),
  add column if not exists bank_account_no varchar(80);

-- Seed departments from existing free-text values (idempotent by name-as-code slug).
insert into public.hr_departments (tenant_id, department_code, department_name, status)
select distinct e.tenant_id,
  left(regexp_replace(lower(trim(e.department)), '[^a-z0-9]+', '-', 'g'), 40),
  trim(e.department),
  'active'
from public.hr_employees e
where coalesce(trim(e.department), '') <> ''
on conflict (tenant_id, department_code) do nothing;

update public.hr_employees e
set department_id = d.id
from public.hr_departments d
where e.tenant_id = d.tenant_id
  and e.department_id is null
  and coalesce(trim(e.department), '') <> ''
  and lower(trim(e.department)) = lower(trim(d.department_name));

-- Check register: issued vs received lifecycle
alter table public.fin_checks
  add column if not exists check_kind text not null default 'issued';

update public.fin_checks set check_kind = 'issued' where coalesce(trim(check_kind), '') = '';

commit;
