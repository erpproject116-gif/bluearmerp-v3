-- Free demo accounts: self-service, industry-seeded tenants + sales leadgen.
begin;

-- 1) Demo lifecycle flags on tenants (industry_type already exists from 001).
alter table public.tenants
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_expires_at timestamptz;

create index if not exists idx_tenants_demo_expiry
  on public.tenants (demo_expires_at)
  where is_demo = true;

-- Keep the built-in demo tenants working under the new is_demo eligibility model.
update public.tenants
set is_demo = true
where company_code in ('DEMO000', 'BLUEARM') and is_demo = false;

-- 2) Industry template registry — drives the signup picker and seed-folder resolution.
create table if not exists public.demo_templates (
  industry_code varchar(50) primary key,
  label varchar(150) not null,
  description text not null default '',
  is_active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only industries with a real, verified seed dataset are marked is_active = true.
-- Adding a new industry later = drop a sql/<industry>/ override folder + flip is_active.
insert into public.demo_templates (industry_code, label, description, is_active, sort_order) values
  ('manufacturing', 'Furniture Manufacturing',
   'Made-to-order furniture maker: quotations, production, delivery receipts, AP/AR, and CRM — the full order-to-cash and procure-to-pay chain.',
   true, 10),
  ('retail', 'Retail / General Merchandise',
   'Multi-branch retail store with fast-moving stock, POS sales, and supplier replenishment.',
   false, 20),
  ('pharmacy', 'Pharmacy / Drugstore',
   'Batch- and expiry-tracked pharmacy with regulated products and daily POS.',
   false, 30),
  ('restaurant', 'Restaurant / Food Service',
   'Menu items, recipes, ingredient purchasing, and counter POS.',
   false, 40),
  ('computer_store', 'Computer / Electronics Store',
   'Serial-tracked electronics retailer with warranties and RMA.',
   false, 50)
on conflict (industry_code) do update
  set label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      updated_at = now();

-- 3) Demo signups — leadgen intake + provisioning lifecycle tracking.
create table if not exists public.demo_signups (
  id bigserial primary key,
  full_name varchar(255) not null,
  email varchar(320) not null,
  mobile varchar(20) not null,                     -- E.164 +63XXXXXXXXXX
  company_name varchar(255),
  industry_code varchar(50) not null references public.demo_templates(industry_code),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'provisioned', 'expired', 'failed')),
  auth_user_id uuid,
  tenant_id bigint references public.tenants(id) on delete set null,
  lead_tenant_id bigint references public.tenants(id) on delete set null,
  lead_id bigint,
  request_ip varchar(64),
  user_agent text,
  error text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  provisioned_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_demo_signups_email
  on public.demo_signups (lower(email), created_at desc);
create index if not exists idx_demo_signups_status
  on public.demo_signups (status, created_at desc);

commit;
