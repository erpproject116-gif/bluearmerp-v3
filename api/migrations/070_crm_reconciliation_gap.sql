-- CRM alert rule: reconciliation_gap for inventory/finance mismatch notifications.
begin;

alter table public.crm_alert_rules
  drop constraint if exists crm_alert_rules_rule_type_check;

alter table public.crm_alert_rules
  add constraint crm_alert_rules_rule_type_check
  check (rule_type in (
    'warranty_follow_up', 'quote_expiring', 'low_stock', 'quote_unconverted', 'custom_kpi', 'reconciliation_gap'
  ));

insert into public.crm_alert_rules (
  tenant_id, rule_type, name, is_enabled, lead_value, lead_unit, threshold_json, sort_order
)
select t.id, 'reconciliation_gap', 'Reconciliation gaps', true, 0, 'days', '{"min_count": 1}'::jsonb, 90
from public.tenants t
where t.status = 'active'
  and not exists (
    select 1 from public.crm_alert_rules r
    where r.tenant_id = t.id and r.rule_type = 'reconciliation_gap'
  );

commit;
