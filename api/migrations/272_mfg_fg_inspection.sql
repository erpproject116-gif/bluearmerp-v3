-- FG QC gate on work orders (mirror GR inspection).
begin;

alter table public.mfg_work_orders
  add column if not exists inspection_status varchar(20) not null default 'released'
    check (inspection_status in ('pending', 'held', 'released')),
  add column if not exists inspection_notes text,
  add column if not exists inspected_at timestamptz,
  add column if not exists inspected_by_user_id bigint references public.users(id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('quality.wo_inspection', 'quality', 'wo_inspection', 'Work order FG inspection', 45)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'quality.wo_inspection', 'write'
from public.tenants t
where t.status = 'active'
on conflict do nothing;

commit;
