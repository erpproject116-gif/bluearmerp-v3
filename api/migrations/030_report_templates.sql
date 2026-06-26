-- Tenant-saved report layout templates (Sales Discount Status first consumer)
begin;

create table if not exists public.tenant_report_templates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  report_key text not null check (report_key in ('sales_discount_status')),
  template_code varchar(60) not null,
  template_name varchar(200) not null,
  settings jsonb not null default '{}',
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, report_key, template_code)
);

create index if not exists idx_tenant_report_templates_lookup
  on public.tenant_report_templates (tenant_id, report_key);

commit;
