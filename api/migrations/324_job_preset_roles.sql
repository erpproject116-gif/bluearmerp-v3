-- Job presets. Insert only when that role_code is missing for the tenant.
-- Does not rewrite store_admin or member (Sales Team), and does not move users.
begin;

create or replace function public.job_preset_level(p_role text, p_code text, p_module text)
returns text
language sql
immutable
as $$
  select case
    when p_role = 'viewer' then 'read'
    when p_code = 'dashboard.view' then 'read'
    when p_role = 'sales' and p_module in ('quotation', 'sales') then 'write'
    when p_role = 'sales' and p_module = 'sales_order' and p_code not like 'sales_order.delivery_receipts%' then 'write'
    when p_role = 'sales' and p_code in ('inventory.partners', 'inventory.items') then 'read'
    when p_role in ('cashier', 'pos_supervisor') and p_code in ('pos.terminal', 'pos.checkout') then 'write'
    when p_role = 'pos_supervisor' and p_code in ('pos.sessions', 'pos.manage') then 'write'
    when p_role in ('cashier', 'pos_supervisor') and p_code in ('inventory.items', 'inventory.price_lists', 'inventory.price_list_items') then 'read'
    when p_role = 'crm' and p_code in ('crm.leads', 'crm.follow_up_tasks', 'crm.pipelines_quotations', 'crm.opportunities') then 'write'
    when p_role = 'crm' and p_module = 'quotation' then 'read'
    when p_role = 'stocks' and p_code in (
      'inventory.items', 'inventory.items_bulk_edit', 'inventory.locations',
      'inventory.stock_entries', 'inventory.stock_entries_post', 'inventory.stock_movements'
    ) then 'write'
    when p_role = 'stocks' and p_code in ('inventory.price_lists', 'inventory.price_list_items') then 'read'
    when p_role = 'receiver' and p_code in (
      'purchase_order.goods_receipts', 'purchase_order.goods_receipts_post', 'purchase_order.goods_receipts_reverse'
    ) then 'write'
    when p_role = 'receiver' and (p_code like 'purchase_order.purchase_orders%' or p_code = 'inventory.items') then 'read'
    when p_role = 'delivery' and (
      p_code like 'sales_order.delivery_receipts%'
      or p_code in ('shipping_order.read', 'shipping_order.write', 'delivery_trip.read', 'delivery_trip.write')
    ) then 'write'
    when p_role = 'delivery' and p_code like 'sales_order.sales_orders%' then 'read'
    when p_role = 'production' and p_code in (
      'manufacturing.boms', 'manufacturing.boms_bulk', 'manufacturing.work_orders',
      'manufacturing.work_orders_bulk', 'manufacturing.work_orders_release', 'manufacturing.work_orders_complete'
    ) then 'write'
    when p_role = 'repair' and p_code in (
      'after_sales.repair_orders', 'after_sales.repair_orders_new', 'after_sales.repair_orders_status'
    ) then 'write'
    when p_role = 'repair' and p_code in ('inventory.items', 'inventory.partners') then 'read'
    when p_role = 'purchasing' and p_module = 'purchase_request' then 'write'
    when p_role = 'purchasing' and (
      p_code like 'purchase_order.rfq%'
      or p_code like 'purchase_order.supplier_quotations%'
      or p_code like 'purchase_order.purchase_orders%'
      or p_code like 'purchase_order.goods_receipts%'
    ) then 'write'
    when p_role in ('bookkeeper', 'accountant') and p_code in (
      'finance.official_receipts', 'finance.official_receipts_new',
      'finance.expenses', 'finance.expenses_write',
      'finance.recurring_expenses', 'finance.recurring_expenses_write',
      'finance.supplier_invoices', 'finance.supplier_invoices_new', 'finance.supplier_invoices_approve',
      'finance.payment_vouchers', 'finance.payment_vouchers_new'
    ) then 'write'
    when p_role = 'accountant' and p_code in (
      'finance.journal_entries', 'finance.journal_entries_new', 'finance.journal_entries_post',
      'finance.bank_reconciliation', 'finance.acct_i'
    ) then 'write'
    when p_role = 'accountant' and p_code like 'finance.reports_%' then 'write'
    when p_role = 'hr' and p_code in (
      'hr.employees', 'hr.employees_new', 'hr.employee_docs', 'hr.attendance', 'hr.leave', 'hr.discipline'
    ) then 'write'
    when p_role = 'payroll' and p_code in ('hr.pay_items', 'hr.payroll_runs', 'hr.remittances', 'hr.special_runs') then 'write'
    when p_role = 'payroll' and p_code = 'hr.employees' then 'read'
    else 'deny'
  end;
$$;

create or replace function public.job_preset_submit(p_role text, p_code text)
returns boolean
language sql
immutable
as $$
  select case
    when p_role = 'sales' and p_code in ('sales.approve', 'sales.sales_returns_submit') then true
    when p_role in ('cashier', 'pos_supervisor') and p_code = 'pos.checkout' then true
    when p_role = 'stocks' and p_code = 'inventory.stock_entries_post' then true
    when p_role = 'receiver' and p_code = 'purchase_order.goods_receipts_post' then true
    when p_role = 'delivery' and p_code = 'sales_order.delivery_receipts_post' then true
    when p_role = 'production' and p_code in ('manufacturing.work_orders_release', 'manufacturing.work_orders_complete') then true
    when p_role = 'purchasing' and p_code in (
      'purchase_request.approve', 'purchase_order.purchase_orders_confirm', 'purchase_order.goods_receipts_post'
    ) then true
    when p_role in ('bookkeeper', 'accountant') and p_code = 'finance.supplier_invoices_approve' then true
    when p_role = 'accountant' and p_code = 'finance.journal_entries_post' then true
    when p_role = 'payroll' and p_code = 'hr.payroll_runs' then true
    else false
  end;
$$;

create or replace function public.seed_job_presets(p_tenant_id bigint)
returns void
language plpgsql
as $$
begin
  insert into public.tenant_roles (
    tenant_id, role_code, role_name, description, is_system,
    can_manage_users, can_manage_form_settings, apply_user_scopes, sort_order
  )
  select p_tenant_id, v.role_code, v.role_name, v.description, true, false, false, false, v.sort_order
  from (
    values
      ('viewer', 'Viewer', 'Read on enabled apps.', 30),
      ('sales', 'Sales', 'Quotations, sales orders, and sales invoices. Read customers and items. No finance, user admin, or stock adjustments.', 31),
      ('cashier', 'Cashier', 'POS terminal and checkout. Read items and prices.', 32),
      ('pos_supervisor', 'POS Supervisor', 'Cashier, plus POS sessions and POS management.', 33),
      ('crm', 'CRM', 'Leads, follow-ups, and the quote board. Read quotations.', 34),
      ('stocks', 'Stocks', 'Items, locations, stock entries, and movements. Read prices.', 35),
      ('receiver', 'Receiver', 'Goods receipts. Read purchase orders and items.', 36),
      ('delivery', 'Delivery', 'Delivery receipts and shipping. Read sales orders.', 37),
      ('production', 'Production', 'BOMs and work orders, including release and complete.', 38),
      ('repair', 'Repair', 'Repair orders. Read items and customers.', 39),
      ('purchasing', 'Purchasing', 'Purchase requests, RFQs, purchase orders, and receipts.', 40),
      ('bookkeeper', 'Bookkeeper', 'Official receipts, expenses, supplier invoices, and payment vouchers. No journal post.', 41),
      ('accountant', 'Accountant', 'Bookkeeper, plus journal post, bank reconciliation, and finance reports.', 42),
      ('hr', 'HR', 'Employees, 201 file, attendance, leave, and discipline. No payroll post.', 43),
      ('payroll', 'Payroll', 'Pay items, payroll runs, and remittances. Read employees.', 44)
  ) as v(role_code, role_name, description, sort_order)
  where not exists (
    select 1 from public.tenant_roles tr
    where tr.tenant_id = p_tenant_id and tr.role_code = v.role_code
  );

  insert into public.tenant_role_permissions (
    tenant_id, role_code, permission_code, access_level, can_submit, can_cancel
  )
  select tr.tenant_id, tr.role_code, pr.permission_code,
    public.job_preset_level(tr.role_code, pr.permission_code, pr.module_code),
    public.job_preset_submit(tr.role_code, pr.permission_code),
    false
  from public.tenant_roles tr
  join public.permission_registry pr on true
  where tr.tenant_id = p_tenant_id
    and tr.role_code in (
      'viewer', 'sales', 'cashier', 'pos_supervisor', 'crm', 'stocks', 'receiver', 'delivery',
      'production', 'repair', 'purchasing', 'bookkeeper', 'accountant', 'hr', 'payroll'
    )
    and not exists (
      select 1 from public.tenant_role_permissions existing
      where existing.tenant_id = tr.tenant_id and existing.role_code = tr.role_code
    );
end;
$$;

do $$
declare
  tid bigint;
begin
  for tid in select id from public.tenants loop
    perform public.seed_job_presets(tid);
  end loop;
end;
$$;

commit;
