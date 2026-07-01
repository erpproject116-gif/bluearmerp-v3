-- Quality QMS: NCRs and goods receipt inspection (hold / release).
begin;

alter table public.gr_goods_receipts
  add column if not exists inspection_status varchar(20) not null default 'pending'
    check (inspection_status in ('pending', 'held', 'released')),
  add column if not exists inspection_notes text,
  add column if not exists inspected_at timestamptz,
  add column if not exists inspected_by_user_id bigint references public.users(id);

update public.gr_goods_receipts
set inspection_status = 'released'
where status in ('posted', 'cancelled') or inspection_status = 'pending';

create table if not exists public.qms_ncrs (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  ncr_no varchar(30) not null,
  ncr_date date not null default current_date,
  title varchar(500) not null,
  description text,
  severity varchar(20) not null default 'minor'
    check (severity in ('minor', 'major', 'critical')),
  status varchar(20) not null default 'open'
    check (status in ('open', 'in_review', 'closed')),
  goods_receipt_id bigint references public.gr_goods_receipts(id) on delete set null,
  item_id bigint references public.inv_items(id) on delete set null,
  created_by_user_id bigint references public.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ncr_no)
);

create index if not exists idx_qms_ncrs_list
  on public.qms_ncrs (tenant_id, status, ncr_date desc);

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('quality', 'Quality', 'tenant', false, true, 38)
on conflict (module_code) do update
set module_name = excluded.module_name, sort_order = excluded.sort_order;

insert into public.module_dependencies (module_code, depends_on_module_code)
values ('quality', 'purchase_order')
on conflict do nothing;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'quality', true
from public.tenants t
where t.auto_enable_all_modules = true and t.status = 'active'
on conflict (tenant_id, module_code) do update
set is_enabled = true, disabled_at = null;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('quality', 'quality', null, 'Quality (module)', 0),
  ('quality.ncrs', 'quality', 'ncrs', 'Non-Conformance Reports', 10),
  ('quality.gr_inspection', 'quality', 'gr_inspection', 'GR Inspection', 20)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
cross join public.permission_registry pr
where pr.module_code = 'quality'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
