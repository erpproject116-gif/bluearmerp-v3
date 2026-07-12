-- Grant warehouse members write on goods receipt post (receive/scan workflow).
-- Reverse and other PO write actions remain store_admin by default.
begin;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'member', 'purchase_order.goods_receipts_post', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
