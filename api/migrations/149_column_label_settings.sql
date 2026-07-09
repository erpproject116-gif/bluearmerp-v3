-- Per-tenant overrides for grid / print column headers.
begin;

create table if not exists public.tenant_column_label_settings (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  view_key text not null,
  column_key varchar(100) not null,
  label_override varchar(255),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, view_key, column_key)
);

create index if not exists idx_column_label_settings_view
  on public.tenant_column_label_settings (tenant_id, view_key);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values ('settings.column_labels', 'user_management', 'column_labels', 'Column Label Settings', 835)
on conflict (permission_code) do nothing;

commit;
