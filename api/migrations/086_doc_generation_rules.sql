-- Document generation rules (Mapping Center)
begin;

create table if not exists public.doc_generation_rules (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  source_entity text not null,
  target_entity text not null,
  field_map jsonb not null default '{}'::jsonb,
  summarize_by text[] not null default '{}',
  require_confirmed_source boolean not null default true,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_entity, target_entity, name)
);

create index if not exists idx_doc_generation_rules_tenant
  on public.doc_generation_rules (tenant_id, source_entity, target_entity) where active;

create table if not exists public.doc_generation_log (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  rule_id bigint references public.doc_generation_rules(id) on delete set null,
  source_entity text not null,
  target_entity text not null,
  source_ids bigint[] not null,
  target_id bigint,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

insert into public.doc_generation_rules (tenant_id, name, source_entity, target_entity, field_map, summarize_by, require_confirmed_source)
select t.id, v.name, v.source_entity, v.target_entity, '{}'::jsonb, v.summarize_by, true
from public.tenants t
cross join (values
  ('Default Quotation to SO', 'quotation', 'sales_order', array['partner_id']::text[]),
  ('Default SO to Sales', 'sales_order', 'sales', array['partner_id']::text[]),
  ('Default SO to DR', 'sales_order', 'delivery_receipt', array['partner_id']::text[]),
  ('Default PR to PO', 'purchase_request', 'purchase_order', array['partner_id']::text[]),
  ('Default GR to Supplier Invoice', 'goods_receipt', 'supplier_invoice', array['partner_id']::text[])
) as v(name, source_entity, target_entity, summarize_by)
on conflict do nothing;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('user_management.doc_generation', 'user_management', 'doc_generation', 'Mapping Center / doc generation', 95)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'user_management.doc_generation', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update set access_level = excluded.access_level;

commit;
