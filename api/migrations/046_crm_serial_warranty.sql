-- CRM warranty: link to serial units, multi-threshold alert support
begin;

alter table public.crm_warranty_assets
  add column if not exists serial_unit_id bigint references public.inv_serial_units(id) on delete set null,
  add column if not exists warranty_origin text not null default 'sales'
    check (warranty_origin in ('sales', 'receipt', 'manual')),
  add column if not exists goods_receipt_line_id bigint references public.gr_goods_receipt_lines(id) on delete set null;

create index if not exists idx_crm_warranty_assets_serial_unit
  on public.crm_warranty_assets (serial_unit_id)
  where serial_unit_id is not null;

create unique index if not exists uq_crm_warranty_assets_tenant_serial
  on public.crm_warranty_assets (tenant_id, serial_no)
  where status <> 'void';

-- Seed default multi-threshold warranty alert rules for tenants that have none
insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'warranty_follow_up', 'Warranty expiry (90 days)', true, 90, 'days',
  '{"days_before_end": [90]}'::jsonb, 10
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'warranty_follow_up' and r.lead_value = 90
  );

insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'warranty_follow_up', 'Warranty expiry (30 days)', true, 30, 'days',
  '{"days_before_end": [30]}'::jsonb, 11
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'warranty_follow_up' and r.lead_value = 30
  );

insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'warranty_follow_up', 'Warranty expiry (7 days)', true, 7, 'days',
  '{"days_before_end": [7]}'::jsonb, 12
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'warranty_follow_up' and r.lead_value = 7
  );

insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'warranty_follow_up', 'Warranty expired', true, 0, 'days',
  '{"days_before_end": [0]}'::jsonb, 13
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'warranty_follow_up' and r.lead_value = 0
  );

commit;
