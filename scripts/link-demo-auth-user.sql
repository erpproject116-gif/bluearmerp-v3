-- Link Supabase Auth user to demo ERP profile
-- 1. Create user in Supabase Dashboard → Authentication → Users
--    email: demo@demo.bluearm.local  password: DemoBluearm2026! (local only)
-- 2. Run: psql "$DATABASE_URL" -v auth_uuid="'<uuid-from-auth-users>'" -f scripts/link-demo-auth-user.sql

update public.users
set auth_user_id = :auth_uuid::uuid, updated_at = now()
where email = 'demo@demo.bluearm.local'
  and tenant_id = (select id from public.tenants where company_code = 'DEMO000');

select u.id, u.email, u.auth_user_id, t.company_code
from public.users u
join public.tenants t on t.id = u.tenant_id
where u.email = 'demo@demo.bluearm.local';