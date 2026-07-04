-- Demo AP: supplier invoice against S3 GR + partial payment voucher (S8)
-- Idempotent: stable invoice_no DEMO-S8-AP, payment_no DEMO-S8-PV
-- Run after: migration 052, seed-demo-golden-scenarios.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_currency_id bigint;
  v_partner_vendor bigint;
  v_grline bigint;
  v_po_line bigint;
  v_item_fabric bigint;
  v_sinv_id bigint;
  v_pay_id bigint;
  v_d date;
  v_grand numeric(18,4) := 50000.0000;
  v_paid numeric(18,4) := 30000.0000;
begin
  v_d := current_date;

  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select id into v_user_id from public.users where tenant_id = v_tenant and status = 'active' order by id limit 1;
    select id into v_currency_id from public.quo_currencies
    where tenant_id = v_tenant and is_default = true and deleted_at is null limit 1;
    select id into v_partner_vendor from public.inv_partners where tenant_id = v_tenant and partner_code = '00004' limit 1;
    select id into v_item_fabric from public.inv_items where tenant_id = v_tenant and item_code = '00004' limit 1;

    select grl.id, grl.purchase_order_line_id into v_grline, v_po_line
    from public.gr_goods_receipt_lines grl
    join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
    join public.po_purchase_orders po on po.id = gr.purchase_order_id
    where po.tenant_id = v_tenant and po.purchase_order_no = 'DEMO-S3-PO' and gr.status = 'posted'
    order by grl.line_no
    limit 1;

    if v_user_id is null or v_currency_id is null or v_partner_vendor is null or v_grline is null then
      raise warning 'seed-demo-finance-ap: missing prerequisites for % (need DEMO-S3-PO posted GR) — skip', v_code;
      continue;
    end if;

    if exists (
      select 1 from public.fin_supplier_invoices si
      join public.fin_supplier_invoice_lines sil on sil.supplier_invoice_id = si.id
      join public.gr_goods_receipt_lines grl on grl.id = sil.goods_receipt_line_id
      join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
      join public.po_purchase_orders po on po.id = gr.purchase_order_id
      where si.tenant_id = v_tenant and si.invoice_no = 'DEMO-S8-AP' and si.deleted_at is null
        and po.purchase_order_no = 'DEMO-S3-PO'
    ) then
      raise notice 'seed-demo-finance-ap: S8 chain OK for %', v_code;
      continue;
    end if;

    -- Remove broken partial S8 rows so idempotent re-run can recreate the chain.
    delete from public.fin_payment_applications pa
    using public.fin_supplier_invoices si
    where si.id = pa.supplier_invoice_id and si.tenant_id = v_tenant and si.invoice_no = 'DEMO-S8-AP';

    delete from public.fin_payment_vouchers pv
    where pv.tenant_id = v_tenant and pv.payment_no = 'DEMO-S8-PV';

    delete from public.gr_goods_receipt_slip_lines gsl
    using public.fin_supplier_invoices si
    where si.id = gsl.supplier_invoice_id and si.tenant_id = v_tenant and si.invoice_no = 'DEMO-S8-AP';

    delete from public.fin_supplier_invoices
    where tenant_id = v_tenant and invoice_no = 'DEMO-S8-AP';

    insert into public.fin_supplier_invoices (
      tenant_id, invoice_date, date_seq, invoice_no,
      partner_id, currency_id, vendor_invoice_no, notes,
      subtotal, tax_total, grand_total, created_by_user_id
    )
    values (
      v_tenant, v_d, 800, 'DEMO-S8-AP',
      v_partner_vendor, v_currency_id, 'VENDOR-S8-001',
      'GOLDEN-S8 supplier invoice against DEMO-S3-PO GR (lot fabric).',
      44642.8571, 5357.1429, v_grand, v_user_id
    )
    returning id into v_sinv_id;

    insert into public.fin_supplier_invoice_lines (
      supplier_invoice_id, line_no, goods_receipt_line_id, purchase_order_line_id,
      item_id, item_code, item_name, qty,
      unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
    )
    select v_sinv_id, 1, v_grline, v_po_line,
      i.id, i.item_code, i.item_name, 50,
      892.8571, 44642.8571, 5357.1429, 1000, v_grand
    from public.inv_items i
    where i.id = v_item_fabric;

    insert into public.gr_goods_receipt_slip_lines (
      goods_receipt_line_id, slip_type, slip_ref, slip_date_no, qty, supplier_invoice_id
    )
    values (
      v_grline, 'supplier_invoice', 'DEMO-S8-AP',
      to_char(v_d, 'MM/DD/YYYY') || '-800', 50, v_sinv_id
    );

    insert into public.fin_payment_vouchers (
      tenant_id, payment_date, date_seq, payment_no,
      partner_id, currency_id, payment_method, reference_no, notes,
      amount_total, created_by_user_id
    )
    values (
      v_tenant, v_d, 801, 'DEMO-S8-PV',
      v_partner_vendor, v_currency_id, 'bank_transfer', 'DEMO-PV-S8',
      'GOLDEN-S8 partial payment (60% of supplier invoice).',
      v_paid, v_user_id
    )
    returning id into v_pay_id;

    insert into public.fin_payment_applications (payment_voucher_id, supplier_invoice_id, applied_amount)
    values (v_pay_id, v_sinv_id, v_paid);

    raise notice 'seed-demo-finance-ap: created S8 AP chain for % (invoice %, paid %)', v_code, v_grand, v_paid;
  end loop;
end $$;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_d date;
  v_max_date_seq int;
  v_max_ref_seq int;
begin
  v_d := current_date;
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then continue; end if;

    select coalesce(max(date_seq), 0) into v_max_date_seq
    from public.fin_supplier_invoices where tenant_id = v_tenant and invoice_date = v_d and deleted_at is null;

    select coalesce(max(substring(invoice_no from 7)::int), 0) into v_max_ref_seq
    from public.fin_supplier_invoices
    where tenant_id = v_tenant and invoice_date = v_d and deleted_at is null
      and invoice_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_supplier_invoice_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_supplier_invoice_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    select coalesce(max(date_seq), 0) into v_max_date_seq
    from public.fin_payment_vouchers where tenant_id = v_tenant and payment_date = v_d and deleted_at is null;

    select coalesce(max(substring(payment_no from 7)::int), 0) into v_max_ref_seq
    from public.fin_payment_vouchers
    where tenant_id = v_tenant and payment_date = v_d and deleted_at is null
      and payment_no ~ ('^' || to_char(v_d, 'YYMMDD') || '[0-9]{3}$');

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_payment_voucher_date_seq', v_d, v_max_date_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);

    insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
    values (v_tenant, 'fin_payment_voucher_no', v_d, v_max_ref_seq)
    on conflict (tenant_id, sequence_key, bucket_date)
    do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value);
  end loop;
end $$;

commit;
