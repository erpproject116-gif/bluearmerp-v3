-- Demo purchase requests for DEMO000 + BLUEARM tenants
-- Idempotent: skips each PR by (tenant_id, purchase_request_no).
-- Run after: migration 036, seed-demo-inventory.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_tax_vat bigint;
  v_currency_id bigint;
  v_loc_hq bigint;
  v_proj bigint;
  v_prid bigint;
  v_d date;
  v_ref text;
begin
  foreach v_code in array array['DEMO000', 'BLUEARM']
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-purchase-requests: tenant % missing — skip', v_code;
      continue;
    end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_tax_vat from public.quo_tax_types
    where tenant_id = v_tenant and name = 'Vat Included' and deleted_at is null limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_loc_hq from public.inv_locations
    where tenant_id = v_tenant and location_code = '00001' limit 1;
    select id into v_proj from public.inv_projects
    where tenant_id = v_tenant and project_code = '00001' limit 1;

    if v_tax_vat is null or v_currency_id is null or v_loc_hq is null then
      raise warning 'seed-demo-purchase-requests: missing tax/currency/location for % — skip', v_code;
      continue;
    end if;

    -- PR with line-level vendor (hybrid: header partner null)
    v_d := current_date;
    v_ref := to_char(v_d, 'YYMMDD') || '201';
    if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = v_ref) then
      insert into public.pr_purchase_requests (
        tenant_id, request_date, date_seq, purchase_request_no,
        tax_type_id, currency_id, pic_user_id, pic_name, location_id,
        project_id, domestic_foreign, send_status, progress_status,
        total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 1, v_ref,
        v_tax_vat, v_currency_id, v_user_id,
        coalesce(u.full_name, 'Demo User'),
        v_loc_hq, v_proj, 'domestic', 'unsent', 'unconfirmed',
        10, 'Office supplies replenishment.',
        8928.5714, 1071.4286, 10000.0000, v_user_id
      from public.users u
      where u.id = v_user_id
      returning id into v_prid;

      insert into public.pr_purchase_request_lines (
        purchase_request_id, line_no, partner_id, partner_code, partner_name,
        item_id, item_code, item_name, spec_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_prid, 1, p.id, p.partner_code, p.company_name,
        i.id, i.item_code, i.item_name, 'A4 bond paper carton',
        10, 892.8571, 8928.5714, 1071.4286, 1000, 10000, 'vat_inc_unit'
      from public.inv_partners p
      cross join public.inv_items i
      where p.tenant_id = v_tenant and p.partner_code = '00004'
        and i.tenant_id = v_tenant and i.item_code = '00001';
    end if;

    -- PR with header vendor partner
    v_ref := to_char(v_d, 'YYMMDD') || '202';
    if not exists (select 1 from public.pr_purchase_requests where tenant_id = v_tenant and purchase_request_no = v_ref) then
      insert into public.pr_purchase_requests (
        tenant_id, request_date, date_seq, purchase_request_no,
        tax_type_id, currency_id, partner_id, pic_user_id, pic_name, location_id,
        domestic_foreign, send_status, progress_status,
        total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id
      )
      select
        v_tenant, v_d, 2, v_ref,
        v_tax_vat, v_currency_id, p.id, v_user_id,
        coalesce(u.full_name, 'Demo User'),
        v_loc_hq, 'domestic', 'sent', 'confirmed',
        2, 'Steel shelving for warehouse.',
        17857.1429, 2142.8571, 20000.0000, v_user_id
      from public.inv_partners p
      left join public.users u on u.id = v_user_id
      where p.tenant_id = v_tenant and p.partner_code = '00004'
      returning id into v_prid;

      insert into public.pr_purchase_request_lines (
        purchase_request_id, line_no, partner_id, partner_code, partner_name,
        item_id, item_code, item_name,
        qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, input_basis
      )
      select v_prid, 1, p.id, p.partner_code, p.company_name,
        i.id, i.item_code, i.item_name,
        2, 8928.5714, 17857.1429, 2142.8571, 10000, 20000, 'vat_inc_unit'
      from public.inv_partners p
      cross join public.inv_items i
      where p.tenant_id = v_tenant and p.partner_code = '00004'
        and i.tenant_id = v_tenant and i.item_code = '00002';
    end if;
  end loop;
end $$;

commit;
