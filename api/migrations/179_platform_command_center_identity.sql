-- Platform Command Center: roles, permissions, invitations.
begin;

-- Expand platform_users roles beyond superadmin.
alter table public.platform_users drop constraint if exists platform_users_role_check;
alter table public.platform_users
  add constraint platform_users_role_check
  check (role in (
    'superadmin',
    'support_viewer',
    'support_agent',
    'onboarding_specialist',
    'customer_success',
    'billing_operator'
  ));

alter table public.platform_users
  add column if not exists last_signed_in_at timestamptz,
  add column if not exists invited_by_platform_user_id bigint references public.platform_users (id) on delete set null,
  add column if not exists notes text;

create table if not exists public.platform_permissions (
  permission_code varchar(80) primary key,
  description text not null default '',
  sort_order int not null default 0
);

create table if not exists public.platform_role_permissions (
  role varchar(40) not null,
  permission_code varchar(80) not null references public.platform_permissions (permission_code) on delete cascade,
  primary key (role, permission_code)
);

create table if not exists public.platform_user_invites (
  id bigserial primary key,
  email varchar(320) not null,
  full_name varchar(255) not null default '',
  role varchar(40) not null default 'support_viewer',
  invited_by_platform_user_id bigint references public.platform_users (id) on delete set null,
  token_hash varchar(128),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_user_invites_role_check check (role in (
    'superadmin',
    'support_viewer',
    'support_agent',
    'onboarding_specialist',
    'customer_success',
    'billing_operator'
  ))
);

create unique index if not exists uq_platform_user_invites_pending_email
  on public.platform_user_invites (lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists idx_platform_user_invites_email
  on public.platform_user_invites (lower(email));

insert into public.platform_permissions (permission_code, description, sort_order) values
  ('platform.command.read', 'Access Command Center overview', 10),
  ('platform.customers.read', 'View platform customers', 20),
  ('platform.customers.write', 'Create/update platform customers', 30),
  ('platform.users.read', 'View customer tenant users', 40),
  ('platform.tickets.read', 'View cross-tenant support tickets', 50),
  ('platform.tickets.write', 'Update tickets / internal notes', 60),
  ('platform.onboarding.read', 'View onboarding snapshots', 70),
  ('platform.activity.read', 'View customer ERP activity/change logs', 80),
  ('platform.access_logs.read', 'View platform access history', 90),
  ('platform.communications.metadata.read', 'View communication metadata', 100),
  ('platform.communications.body.read', 'View email bodies', 110),
  ('platform.attachments.download', 'Download support attachments', 120),
  ('platform.followups.read', 'View platform follow-ups', 130),
  ('platform.followups.write', 'Create/update platform follow-ups', 140),
  ('platform.plans.read', 'View plans & pricing', 150),
  ('platform.plans.write', 'Edit plans & pricing', 160),
  ('platform.billing.write', 'Manage subscriptions / invoices', 170),
  ('platform.provisioning.write', 'Provision workspaces', 180),
  ('platform.staff.manage', 'Invite and manage platform staff', 190)
on conflict (permission_code) do update
set description = excluded.description, sort_order = excluded.sort_order;

-- Superadmin: all permissions.
insert into public.platform_role_permissions (role, permission_code)
select 'superadmin', p.permission_code from public.platform_permissions p
on conflict do nothing;

-- Support viewer: read-only ops.
insert into public.platform_role_permissions (role, permission_code) values
  ('support_viewer', 'platform.command.read'),
  ('support_viewer', 'platform.customers.read'),
  ('support_viewer', 'platform.users.read'),
  ('support_viewer', 'platform.tickets.read'),
  ('support_viewer', 'platform.onboarding.read'),
  ('support_viewer', 'platform.activity.read'),
  ('support_viewer', 'platform.followups.read'),
  ('support_viewer', 'platform.plans.read')
on conflict do nothing;

-- Support agent: tickets + follow-ups write.
insert into public.platform_role_permissions (role, permission_code)
select 'support_agent', permission_code from public.platform_role_permissions where role = 'support_viewer'
on conflict do nothing;
insert into public.platform_role_permissions (role, permission_code) values
  ('support_agent', 'platform.tickets.write'),
  ('support_agent', 'platform.followups.write'),
  ('support_agent', 'platform.access_logs.read'),
  ('support_agent', 'platform.communications.metadata.read')
on conflict do nothing;

-- Onboarding specialist.
insert into public.platform_role_permissions (role, permission_code)
select 'onboarding_specialist', permission_code from public.platform_role_permissions where role = 'support_viewer'
on conflict do nothing;
insert into public.platform_role_permissions (role, permission_code) values
  ('onboarding_specialist', 'platform.followups.write'),
  ('onboarding_specialist', 'platform.access_logs.read')
on conflict do nothing;

-- Customer success / sales.
insert into public.platform_role_permissions (role, permission_code)
select 'customer_success', permission_code from public.platform_role_permissions where role = 'support_agent'
on conflict do nothing;
insert into public.platform_role_permissions (role, permission_code) values
  ('customer_success', 'platform.billing.write')
on conflict do nothing;

-- Billing operator.
insert into public.platform_role_permissions (role, permission_code) values
  ('billing_operator', 'platform.command.read'),
  ('billing_operator', 'platform.customers.read'),
  ('billing_operator', 'platform.plans.read'),
  ('billing_operator', 'platform.plans.write'),
  ('billing_operator', 'platform.billing.write'),
  ('billing_operator', 'platform.provisioning.write'),
  ('billing_operator', 'platform.access_logs.read')
on conflict do nothing;

-- Ensure bootstrap owners remain active superadmins when present.
update public.platform_users
set role = 'superadmin', is_active = true
where lower(email) in (
  'itsjohnranel@gmail.com',
  'bluearmph@gmail.com',
  'erpproject116@gmail.com'
);

commit;
