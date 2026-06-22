-- =============================================================================
-- Diagnose "Account not provisioned yet" / No tenant profile
-- =============================================================================
-- Run in the SAME Supabase project your Render API uses (check SUPABASE_URL).
-- The API matches JWT sub → public.users.auth_user_id (not platform_users alone).
-- =============================================================================

-- 1) Google accounts that exist in Supabase Auth
select
  au.id as auth_user_id,
  au.email,
  au.last_sign_in_at,
  au.created_at
from auth.users au
where lower(au.email) in ('itsjohnranel@gmail.com', 'bluearmph@gmail.com')
order by au.email;

-- 2) ERP user rows on BLUEARM
select
  u.id as app_user_id,
  u.email,
  u.status,
  u.auth_user_id,
  u.auth_user_id is not null as auth_linked,
  t.company_code,
  t.status as tenant_status
from public.users u
join public.tenants t on t.id = u.tenant_id
where t.company_code = 'BLUEARM'
   or lower(u.email) in ('itsjohnranel@gmail.com', 'bluearmph@gmail.com')
order by u.email;

-- 3) Platform superadmin rows (optional — app still needs #2 auth_linked)
select
  pu.auth_user_id,
  pu.email,
  pu.role,
  pu.is_active
from public.platform_users pu
where lower(pu.email) in ('itsjohnranel@gmail.com', 'bluearmph@gmail.com')
order by pu.email;

-- 4) MISMATCH: Auth UUID ≠ ERP users.auth_user_id (common cause of 403)
select
  au.email,
  au.id as auth_users_id,
  u.auth_user_id as erp_auth_user_id,
  case
    when u.id is null then 'MISSING public.users row on BLUEARM — run seed-platform-owners.sql'
    when u.auth_user_id is null then 'users row exists but auth_user_id NULL — run link-platform-owners.sql'
    when u.auth_user_id <> au.id then 'UUID MISMATCH — run link-platform-owners.sql again'
    when u.status <> 'active' then 'users.status is not active'
    else 'OK — API should accept this account'
  end as diagnosis
from auth.users au
left join public.users u
  on lower(u.email) = lower(au.email)
left join public.tenants t
  on t.id = u.tenant_id and t.company_code = 'BLUEARM'
where lower(au.email) in ('itsjohnranel@gmail.com', 'bluearmph@gmail.com')
order by au.email;

-- 5) Schema required by API auth query (migration 012)
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'tenant_roles'
) as tenant_roles_table;

-- 6) Exact API /auth/me SQL (expect api_auth_me_rows = 1)
select count(*)::int as api_auth_me_rows
from public.users u
join public.tenants t on t.id = u.tenant_id
left join public.tenant_roles tr
  on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role and tr.is_active = true
left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
where u.auth_user_id = '400b6912-fa01-46e2-9192-abc514741c22'::uuid
  and u.status = 'active'
  and t.status not in ('suspended', 'cancelled');
