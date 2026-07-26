-- Ops intelligence: default project dashboard widgets (risk + completion) + CRM clients permission.
begin;

-- Seed missing widgets on existing default dashboards.
insert into public.wm_dashboard_widgets (
  dashboard_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
)
select d.id, v.widget_type, v.title, '{}'::jsonb, v.grid_x, v.grid_y, 6, 3, v.sort_order
from public.wm_dashboards d
cross join (
  values
    ('job_cost_bva', 'Budget vs Actual', 0, 0, 0),
    ('work_item_summary', 'Work Items by Status', 6, 0, 10),
    ('work_item_risk', 'Milestone risk', 0, 3, 20),
    ('work_item_completion', '% complete', 6, 3, 30)
) as v(widget_type, title, grid_x, grid_y, sort_order)
where d.is_default = true
  and not exists (
    select 1 from public.wm_dashboard_widgets w
    where w.dashboard_id = d.id and w.widget_type = v.widget_type
  );

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values ('crm.clients', 'crm', 'clients', 'Clients account health', 570)
on conflict (permission_code) do update
set module_code = excluded.module_code,
    feature_key = excluded.feature_key,
    label = excluded.label,
    sort_order = excluded.sort_order;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'crm.clients', 'write'
from public.tenants t
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
