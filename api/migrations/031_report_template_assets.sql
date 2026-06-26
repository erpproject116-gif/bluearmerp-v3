-- Extend report templates: more report keys + logo assets
begin;

alter table public.tenant_report_templates
  drop constraint if exists tenant_report_templates_report_key_check;

alter table public.tenant_report_templates
  add constraint tenant_report_templates_report_key_check
  check (report_key in (
    'sales_discount_status',
    'sales_status',
    'sales_order_status',
    'official_receipt_status'
  ));

create table if not exists public.tenant_report_template_assets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  report_key text not null,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_report_template_assets_tenant
  on public.tenant_report_template_assets (tenant_id, report_key);

commit;
