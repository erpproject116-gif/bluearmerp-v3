-- Per-tenant switch for agency pages. Default on so existing HR menus stay as they are.
-- Turning it off hides those pages. It does not delete clients, sites, assignments, or bills.
begin;

create table if not exists public.hr_tenant_settings (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  manpower_mode boolean not null default true,
  updated_at timestamptz not null default now()
);

commit;
