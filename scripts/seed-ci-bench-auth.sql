-- CI bench auth: link DEMO000 demo user to a fixed auth UUID for JWT minting.
-- Safe to re-run (idempotent).
begin;

update public.users u
set auth_user_id = '00000000-0000-4000-8000-000000000001'::uuid
from public.tenants t
where u.tenant_id = t.id
  and t.company_code = 'DEMO000'
  and u.email = 'demo@demo.bluearm.local'
  and (
    u.auth_user_id is null
    or u.auth_user_id is distinct from '00000000-0000-4000-8000-000000000001'::uuid
  );

commit;
