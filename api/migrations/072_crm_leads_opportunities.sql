-- CRM leads and opportunities.
begin;

create table if not exists public.crm_leads (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  lead_name varchar(255) not null,
  company_name varchar(255),
  email varchar(255),
  phone varchar(50),
  source varchar(50) not null default 'manual',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'lost', 'converted')),
  partner_id bigint references public.inv_partners(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_leads_list
  on public.crm_leads (tenant_id, status, updated_at desc);

create table if not exists public.crm_opportunities (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  lead_id bigint references public.crm_leads(id) on delete set null,
  partner_id bigint references public.inv_partners(id),
  title varchar(255) not null,
  stage text not null default 'prospect'
    check (stage in ('prospect', 'qualification', 'proposal', 'negotiation', 'won', 'lost')),
  expected_value numeric(18,4),
  expected_close_date date,
  probability int check (probability is null or (probability >= 0 and probability <= 100)),
  quotation_id bigint references public.quo_quotations(id),
  pic_user_id bigint references public.users(id),
  pic_name varchar(255) not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_opportunities_list
  on public.crm_opportunities (tenant_id, stage, expected_close_date);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('crm.leads', 'crm', 'leads', 'Leads', 560),
  ('crm.opportunities', 'crm', 'opportunities', 'Opportunities', 561)
on conflict (permission_code) do nothing;

commit;
