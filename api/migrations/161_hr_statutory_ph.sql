-- GA-1: PH statutory payroll foundation — employee IDs, versioned agency settings, richer payslip lines.
begin;

alter table public.hr_employees
  add column if not exists tin varchar(30),
  add column if not exists sss_no varchar(30),
  add column if not exists philhealth_no varchar(30),
  add column if not exists pagibig_no varchar(30),
  add column if not exists tax_status varchar(30) not null default 'S'
    check (tax_status in ('S', 'ME', 'S1', 'S2', 'S3', 'S4', 'ME1', 'ME2', 'ME3', 'ME4', 'Z'));

comment on column public.hr_employees.tax_status is 'BIR withholding status code (simplified).';

-- System-wide statutory package versions (tenants inherit; optional tenant override later).
create table if not exists public.hr_statutory_packages (
  id bigserial primary key,
  package_code varchar(40) not null unique,
  agency varchar(20) not null check (agency in ('sss', 'philhealth', 'pagibig', 'bir')),
  title varchar(255) not null,
  source_ref varchar(255) not null default '',
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_statutory_packages_agency
  on public.hr_statutory_packages (agency, effective_from desc);

alter table public.hr_payslip_lines
  drop constraint if exists hr_payslip_lines_line_type_check;

alter table public.hr_payslip_lines
  add constraint hr_payslip_lines_line_type_check
  check (line_type in ('earning', 'deduction', 'employer_share'));

alter table public.hr_payslip_lines
  add column if not exists line_code varchar(40) not null default '';

create index if not exists idx_hr_payslip_lines_code
  on public.hr_payslip_lines (payslip_id, line_code);

-- Seed PH packages (config drives engines; SSS MSC bands are derived in code from Cir. 2024-006).
insert into public.hr_statutory_packages (package_code, agency, title, source_ref, effective_from, config)
values
  (
    'SSS_2025_CIR_2024_006',
    'sss',
    'SSS contributions (Jan 2025+)',
    'SSS Circular No. 2024-006',
    '2025-01-01',
    '{
      "employee_rate": 0.05,
      "employer_rate": 0.10,
      "msc_min": 5000,
      "msc_max": 35000,
      "regular_msc_cap": 20000,
      "ec_low": 10,
      "ec_high": 30,
      "ec_comp_threshold": 14750,
      "band_start": 5250,
      "band_width": 500
    }'::jsonb
  ),
  (
    'PHIC_2026_5PCT',
    'philhealth',
    'PhilHealth premium 5%',
    'UHC / PhilHealth 2026 schedule',
    '2025-01-01',
    '{
      "rate": 0.05,
      "employee_share": 0.5,
      "employer_share": 0.5,
      "salary_floor": 10000,
      "salary_ceiling": 100000
    }'::jsonb
  ),
  (
    'HDMF_2026_STD',
    'pagibig',
    'Pag-IBIG Fund contributions',
    'HDMF contribution schedule 2026',
    '2025-01-01',
    '{
      "low_threshold": 1500,
      "ceiling": 10000,
      "employee_rate_low": 0.01,
      "employee_rate": 0.02,
      "employer_rate": 0.02,
      "max_ee": 200,
      "max_er": 200
    }'::jsonb
  ),
  (
    'BIR_TRAIN_ANNUALIZED_2026',
    'bir',
    'BIR TRAIN annualized monthly withholding',
    'TRAIN Law income tax brackets (Taxumo 2026 summary)',
    '2025-01-01',
    '{
      "method": "annualized",
      "brackets": [
        {"limit": 250000, "base": 0, "rate": 0},
        {"limit": 400000, "base": 0, "rate": 0.15},
        {"limit": 800000, "base": 22500, "rate": 0.20},
        {"limit": 2000000, "base": 102500, "rate": 0.25},
        {"limit": 8000000, "base": 402500, "rate": 0.30},
        {"limit": null, "base": 2202500, "rate": 0.35}
      ]
    }'::jsonb
  )
on conflict (package_code) do update
set title = excluded.title,
    source_ref = excluded.source_ref,
    effective_from = excluded.effective_from,
    config = excluded.config,
    is_active = true;

-- Remittance / payable CoA helpers (reuse PH template codes when present).
insert into public.fin_gl_accounts (account_code, account_name, sort_order) values
  ('2050', 'SSS / PhilHealth / Pag-IBIG Payable', 205),
  ('2051', 'Withholding Tax Payable - Compensation', 206),
  ('5110', 'Employer SSS / PhilHealth / Pag-IBIG Share', 511)
on conflict (account_code) do update
set account_name = excluded.account_name, sort_order = excluded.sort_order;

insert into public.fin_accounts (tenant_id, account_code, account_name, account_type, sort_order)
select t.id, g.account_code, g.account_name,
  case
    when g.account_code like '2%' then 'liability'
    when g.account_code like '5%' then 'expense'
    else 'expense'
  end,
  g.sort_order
from public.tenants t
cross join public.fin_gl_accounts g
where t.status = 'active' and g.account_code in ('2050', '2051', '5110')
on conflict (tenant_id, account_code) do nothing;

commit;
