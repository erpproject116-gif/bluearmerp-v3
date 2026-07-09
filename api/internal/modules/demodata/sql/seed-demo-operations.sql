-- Demo Operations Hub: Riverside Office Renovation workspace (construction pack).
-- Idempotent: skips when workspace demo-riverside-reno already exists.
-- Run after: 140_operations_hub.sql, seed-demo-golden-scenarios.sql (optional quotation link)
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_partner_sm bigint;
  v_quotation_id bigint;
  v_inv_project_id bigint;
  v_jc_project_id bigint;
  v_workspace_id bigint;
  v_dashboard_id bigint;
  v_col_backlog bigint;
  v_col_planning bigint;
  v_col_in_progress bigint;
  v_col_inspection bigint;
  v_col_complete bigint;
  v_d date;
begin
  v_d := current_date;

  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-operations: tenant % missing — skip', v_code;
      continue;
    end if;

    if exists (
      select 1 from public.wm_workspaces
      where tenant_id = v_tenant and workspace_code = 'demo-riverside-reno'
    ) then
      raise notice 'seed-demo-operations: workspace demo-riverside-reno exists for % — skip', v_code;
      continue;
    end if;

    select u.id into v_user_id
    from public.users u
    where u.tenant_id = v_tenant and u.status = 'active'
    order by u.id
    limit 1;

    select id into v_partner_sm from public.inv_partners
    where tenant_id = v_tenant and partner_code = '00001'
    limit 1;

    select q.id into v_quotation_id
    from public.quo_quotations q
    where q.tenant_id = v_tenant and q.deleted_at is null
    order by case when q.reference_no like 'DEMO%' then 0 else 1 end, q.id
    limit 1;

    insert into public.tenant_modules (tenant_id, module_code, is_enabled)
    values (v_tenant, 'operations', true)
    on conflict (tenant_id, module_code) do update
    set is_enabled = true, disabled_at = null;

    insert into public.inv_projects (tenant_id, project_code, project_name, status)
    values (v_tenant, '00008', 'Riverside Office Renovation', 'active')
    on conflict (tenant_id, project_code) do nothing;

    select id into v_inv_project_id from public.inv_projects
    where tenant_id = v_tenant and project_code = '00008';

    if v_inv_project_id is null then
      select id into v_inv_project_id from public.inv_projects
      where tenant_id = v_tenant and deleted_at is null
      order by project_code
      limit 1;
    end if;

    insert into public.job_cost_projects (
      tenant_id, project_code, project_name, inv_project_id, status
    ) values (
      v_tenant, 'demo-riverside-reno', 'Riverside Office Renovation', v_inv_project_id, 'active'
    )
    on conflict (tenant_id, project_code) do nothing;

    select id into v_jc_project_id from public.job_cost_projects
    where tenant_id = v_tenant and project_code = 'demo-riverside-reno';

    if v_jc_project_id is null or v_inv_project_id is null then
      raise warning 'seed-demo-operations: missing project ids for % — skip', v_code;
      continue;
    end if;

    insert into public.wm_workspaces (
      tenant_id, workspace_code, workspace_name, industry_pack,
      inv_project_id, job_cost_project_id, status
    ) values (
      v_tenant, 'demo-riverside-reno', 'Riverside Office Renovation', 'construction',
      v_inv_project_id, v_jc_project_id, 'active'
    )
    returning id into v_workspace_id;

    insert into public.wm_columns (workspace_id, column_key, column_name, sort_order, column_color) values
      (v_workspace_id, 'backlog', 'Backlog', 0, '#94a3b8'),
      (v_workspace_id, 'planning', 'Planning', 10, '#60a5fa'),
      (v_workspace_id, 'in_progress', 'In Progress', 20, '#fbbf24'),
      (v_workspace_id, 'inspection', 'Inspection', 30, '#a78bfa'),
      (v_workspace_id, 'complete', 'Complete', 40, '#34d399');

    select id into v_col_backlog from public.wm_columns where workspace_id = v_workspace_id and column_key = 'backlog';
    select id into v_col_planning from public.wm_columns where workspace_id = v_workspace_id and column_key = 'planning';
    select id into v_col_in_progress from public.wm_columns where workspace_id = v_workspace_id and column_key = 'in_progress';
    select id into v_col_inspection from public.wm_columns where workspace_id = v_workspace_id and column_key = 'inspection';
    select id into v_col_complete from public.wm_columns where workspace_id = v_workspace_id and column_key = 'complete';

    insert into public.wm_work_items (
      tenant_id, workspace_id, column_id, title, status, priority,
      assignee_user_id, partner_id, start_date, end_date, quotation_id
    ) values
      (v_tenant, v_workspace_id, v_col_backlog, 'Site survey & as-built measurements', 'open', 'high', v_user_id, v_partner_sm, v_d, v_d + 2, v_quotation_id),
      (v_tenant, v_workspace_id, v_col_backlog, 'Geotechnical soil test coordination', 'open', 'normal', v_user_id, null, v_d + 1, v_d + 5, null),
      (v_tenant, v_workspace_id, v_col_planning, 'Building permit application (LG U)', 'open', 'high', v_user_id, v_partner_sm, v_d + 3, v_d + 21, null),
      (v_tenant, v_workspace_id, v_col_planning, 'Structural drawings — architect review', 'open', 'normal', v_user_id, null, v_d + 5, v_d + 12, null),
      (v_tenant, v_workspace_id, v_col_planning, 'Electrical & plumbing layout approval', 'open', 'normal', v_user_id, null, v_d + 7, v_d + 14, null),
      (v_tenant, v_workspace_id, v_col_planning, 'Procure rebar & formwork — Level 2 slab', 'open', 'urgent', v_user_id, null, v_d + 10, v_d + 16, null),
      (v_tenant, v_workspace_id, v_col_in_progress, 'Formwork & rebar — Level 2 slab pour', 'in_progress', 'high', v_user_id, null, v_d + 14, v_d + 20, null),
      (v_tenant, v_workspace_id, v_col_in_progress, 'MEP rough-in — electrical conduit', 'in_progress', 'normal', v_user_id, null, v_d + 16, v_d + 24, null),
      (v_tenant, v_workspace_id, v_col_in_progress, 'Waterproofing — basement retaining wall', 'in_progress', 'high', v_user_id, null, v_d + 18, v_d + 22, null),
      (v_tenant, v_workspace_id, v_col_inspection, 'Fire protection inspection prep', 'open', 'normal', v_user_id, null, v_d + 22, v_d + 25, null),
      (v_tenant, v_workspace_id, v_col_inspection, 'Final punch list — lobby & common areas', 'open', 'high', v_user_id, v_partner_sm, v_d + 24, v_d + 28, null),
      (v_tenant, v_workspace_id, v_col_complete, 'Client walkthrough & snag list sign-off', 'done', 'normal', v_user_id, v_partner_sm, v_d + 28, v_d + 30, null),
      (v_tenant, v_workspace_id, v_col_complete, 'As-built drawings & turnover binder', 'done', 'low', v_user_id, null, v_d + 29, v_d + 35, null);

    insert into public.wm_automation_rules (
      tenant_id, workspace_id, rule_name, trigger_event, trigger_config, action_type, action_config, is_active
    ) values (
      v_tenant, v_workspace_id, 'Notify on new work item', 'work_item.created', '{}'::jsonb,
      'notify', '{"message": "A new construction work item was created."}'::jsonb, true
    );

    insert into public.wm_dashboards (tenant_id, workspace_id, dashboard_name, is_default)
    values (v_tenant, v_workspace_id, 'Operations Dashboard', true)
    returning id into v_dashboard_id;

    insert into public.wm_dashboard_widgets (
      dashboard_id, widget_type, title, config, grid_x, grid_y, grid_w, grid_h, sort_order
    ) values
      (v_dashboard_id, 'job_cost_bva', 'Budget vs Actual', '{}'::jsonb, 0, 0, 6, 3, 0),
      (v_dashboard_id, 'work_item_summary', 'Work Items by Status', '{}'::jsonb, 6, 0, 6, 3, 10);

    raise notice 'seed-demo-operations: created demo-riverside-reno for %', v_code;
  end loop;
end $$;

commit;
