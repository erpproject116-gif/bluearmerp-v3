-- Financial health: overdue AR alerts + tenant recurring expense auditor.
begin;

alter table public.crm_alert_rules
  drop constraint if exists crm_alert_rules_rule_type_check;

alter table public.crm_alert_rules
  add constraint crm_alert_rules_rule_type_check
  check (rule_type in (
    'warranty_follow_up', 'quote_expiring', 'low_stock', 'quote_unconverted',
    'custom_kpi', 'reconciliation_gap', 'overdue_ar'
  ));

insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'overdue_ar', 'Overdue customer invoices', true, 1, 'days',
  '{"min_age_days": 1, "min_balance": 0.01}'::jsonb, 20
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'overdue_ar'
  );

create table if not exists public.fin_recurring_expenses (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(255) not null,
  category varchar(100) not null default 'other',
  vendor_name varchar(255) not null default '',
  amount numeric(18,4) not null check (amount >= 0),
  currency_code varchar(10) not null default 'PHP',
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date date,
  is_active boolean not null default true,
  notes text not null default '',
  partner_id bigint references public.inv_partners(id) on delete set null,
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_fin_recurring_expenses_tenant_active
  on public.fin_recurring_expenses (tenant_id, is_active)
  where deleted_at is null;

commit;
