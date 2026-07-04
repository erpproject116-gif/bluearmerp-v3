-- Multi-tenant membership: allow one Supabase auth identity to belong to many tenants.
-- Model: one public.users row per (auth_user_id, tenant_id). Everything per-tenant is
-- already keyed on users.id + tenant_id, so this is the least-invasive change.
begin;

-- The global unique on users.auth_user_id (inline column constraint from 001_platform.sql,
-- named users_auth_user_id_key) blocks multi-business logins. Drop it and re-scope per tenant.
alter table public.users
  drop constraint if exists users_auth_user_id_key;

-- Same identity may appear once per tenant, never twice in the same tenant.
create unique index if not exists uq_users_auth_user_tenant
  on public.users (auth_user_id, tenant_id)
  where auth_user_id is not null;

-- Persist the user's last-selected business so a request without X-Tenant-ID resolves
-- to a stable default instead of an arbitrary row.
create table if not exists public.user_active_tenant (
  auth_user_id uuid primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);

commit;
