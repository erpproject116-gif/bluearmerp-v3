-- bluearmph@gmail.com is a platform superadmin (same as itsjohnranel) AND the
-- store owner of every company they already belong to — not BLUEARM-only.
begin;

update public.users u
set tenant_role = 'store_admin',
    status = 'active',
    updated_at = now()
where lower(u.email) = 'bluearmph@gmail.com'
  and u.status in ('active', 'invited')
  and (u.tenant_role is distinct from 'store_admin' or u.status is distinct from 'active');

update public.tenants t
set owner_user_id = u.id, updated_at = now()
from public.users u
where lower(u.email) = 'bluearmph@gmail.com'
  and u.status = 'active'
  and t.id = u.tenant_id
  and t.owner_user_id is distinct from u.id;

commit;
