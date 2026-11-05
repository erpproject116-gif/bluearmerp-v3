-- HR clients are manpower customers. Each one is a Sales customer:
-- either an existing inv_partners row, or a customer created with the client.
-- A site belongs to one client and one industry. An assignment places an
-- existing employee on a site. It does not change hr_employees.status.
begin;

create table if not exists public.hr_clients (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(255) not null,
  partner_id bigint not null references public.inv_partners(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_hr_clients_partner
  on public.hr_clients (tenant_id, partner_id);

create index if not exists idx_hr_clients_tenant
  on public.hr_clients (tenant_id, name);

create table if not exists public.hr_client_sites (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  client_id bigint not null references public.hr_clients(id) on delete cascade,
  site_name varchar(255) not null,
  industry_id bigint not null references public.hr_applicant_segments(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_hr_client_sites_client
  on public.hr_client_sites (tenant_id, client_id);

create table if not exists public.hr_assignments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id) on delete restrict,
  site_id bigint not null references public.hr_client_sites(id) on delete restrict,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists uq_hr_assignments_open_employee
  on public.hr_assignments (tenant_id, employee_id)
  where end_date is null;

create index if not exists idx_hr_assignments_site
  on public.hr_assignments (tenant_id, site_id);

commit;
