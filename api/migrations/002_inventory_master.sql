-- Bluearm ERP v3 — inventory master data
begin;

create table if not exists public.inv_partners (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_code char(5) not null,
  partner_kind text not null check (partner_kind in ('customer', 'vendor', 'both')),
  company_name varchar(255) not null,
  ceo_name varchar(255),
  phone varchar(80),
  mobile varchar(80),
  email varchar(320),
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, partner_code)
);

create index if not exists idx_inv_partners_list
  on public.inv_partners (tenant_id, partner_code)
  where deleted_at is null;

create table if not exists public.inv_locations (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  location_code char(5) not null,
  location_name varchar(255) not null,
  location_type text not null
    check (location_type in ('location', 'factory', 'factory_oe_manage')),
  production_process text not null
    check (production_process in ('bundle', 'service')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_code)
);

create index if not exists idx_inv_locations_list
  on public.inv_locations (tenant_id, location_code)
  where deleted_at is null;

create table if not exists public.inv_projects (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  project_code char(5) not null,
  project_name varchar(255) not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_code)
);

create index if not exists idx_inv_projects_list
  on public.inv_projects (tenant_id, project_code)
  where deleted_at is null;

create table if not exists public.inv_departments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  department_code char(5) not null,
  department_name varchar(255) not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, department_code)
);

create index if not exists idx_inv_departments_list
  on public.inv_departments (tenant_id, department_code)
  where deleted_at is null;

create table if not exists public.inv_items (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  item_code char(5) not null,
  item_name varchar(500) not null,
  purchase_price numeric(18,4) not null default 0,
  sales_price numeric(18,4) not null default 0,
  vip_price numeric(18,4) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_code)
);

create index if not exists idx_inv_items_list
  on public.inv_items (tenant_id, item_code)
  where deleted_at is null;

commit;
