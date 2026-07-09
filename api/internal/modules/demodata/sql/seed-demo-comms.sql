-- Demo Communications: sent message log, templates, stub inbox rows linked to demo documents.
-- Idempotent: skips when DEMO-COMMS-QUOTE sent message already exists.
-- Run after: seed-demo-golden-scenarios.sql, seed-demo-operations.sql
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
  v_user_id bigint;
  v_partner_sm bigint;
  v_q_id bigint;
  v_q_ref text;
  v_so_id bigint;
  v_so_no text;
  v_si_id bigint;
  v_si_no text;
  v_po_id bigint;
  v_po_no text;
  v_sent_q bigint;
  v_sent_so bigint;
  v_sent_po bigint;
  v_sent_si bigint;
begin
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise warning 'seed-demo-comms: tenant % missing — skip', v_code;
      continue;
    end if;

    if exists (
      select 1 from public.com_sent_messages
      where tenant_id = v_tenant and subject = 'DEMO-COMMS-QUOTE'
    ) then
      raise notice 'seed-demo-comms: demo sent messages exist for % — skip', v_code;
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

    select q.id, q.reference_no into v_q_id, v_q_ref
    from public.quo_quotations q
    where q.tenant_id = v_tenant and q.deleted_at is null
    order by case when q.reference_no like 'DEMO%' then 0 else 1 end, q.id
    limit 1;

    select so.id, so.sales_order_no into v_so_id, v_so_no
    from public.so_sales_orders so
    where so.tenant_id = v_tenant and so.sales_order_no = 'DEMO-S2-SO' and so.deleted_at is null
    limit 1;

    select s.id, s.sales_no into v_si_id, v_si_no
    from public.sa_sales s
    where s.tenant_id = v_tenant and s.sales_no = 'DEMO-S2-SI' and s.deleted_at is null
    limit 1;

    select po.id, po.purchase_order_no into v_po_id, v_po_no
    from public.po_purchase_orders po
    where po.tenant_id = v_tenant and po.purchase_order_no = 'DEMO-S2-PO'
    limit 1;

    insert into public.tenant_modules (tenant_id, module_code, is_enabled)
    values (v_tenant, 'comms', true)
    on conflict (tenant_id, module_code) do update
    set is_enabled = true, disabled_at = null;

    insert into public.com_email_templates (tenant_id, doc_type, subject_tpl, body_tpl) values
      (v_tenant, 'quotation', 'Quotation {{reference_no}} from {{company_name}}',
        E'Dear {{customer_name}},\n\nPlease find attached quotation {{reference_no}}.\n\nThank you,\n{{company_name}}'),
      (v_tenant, 'sales_order', 'Sales Order {{sales_order_no}} — {{company_name}}',
        E'Dear {{customer_name}},\n\nAttached is sales order {{sales_order_no}} for your review.\n\nRegards,\n{{company_name}}'),
      (v_tenant, 'purchase_order', 'Purchase Order {{purchase_order_no}}',
        E'Dear {{supplier_name}},\n\nPlease find PO {{purchase_order_no}} attached.\n\nProcurement team'),
      (v_tenant, 'sales', 'Invoice {{sales_no}} from {{company_name}}',
        E'Dear {{customer_name}},\n\nPlease find invoice {{sales_no}} attached.\n\nAccounts receivable')
    on conflict (tenant_id, doc_type) do update
    set subject_tpl = excluded.subject_tpl,
        body_tpl = excluded.body_tpl,
        updated_at = now();

    if v_q_id is not null then
      insert into public.com_sent_messages (
        tenant_id, channel, doc_type, doc_id, to_addrs, cc_addrs, subject, body_text,
        status, sent_by_user_id, gmail_message_id, gmail_thread_id, created_at
      ) values (
        v_tenant, 'email', 'quotation', v_q_id,
        jsonb_build_array('procurement@demo-customer.test'),
        '[]'::jsonb,
        'DEMO-COMMS-QUOTE',
        format('Please find our quotation %s attached. Valid for 30 days.', coalesce(v_q_ref, 'Q-DEMO')),
        'sent', v_user_id, 'demo-gmail-msg-q-001', 'demo-gmail-thread-q-001',
        now() - interval '3 days'
      )
      returning id into v_sent_q;

      insert into public.com_thread_links (sent_message_id, doc_type, doc_id)
      values (v_sent_q, 'quotation', v_q_id);

      insert into public.com_mail_messages (
        tenant_id, owner_user_id, gmail_message_id, gmail_thread_id, direction,
        from_addr, to_addrs, subject, snippet, body_text, internal_date,
        sent_message_id, linked_doc_type, linked_doc_id, is_stub
      ) values (
        v_tenant, v_user_id, 'demo-gmail-msg-q-001', 'demo-gmail-thread-q-001', 'outbound',
        'sales@demo-tenant.test',
        jsonb_build_array('procurement@demo-customer.test'),
        format('Quotation %s — Riverside project', coalesce(v_q_ref, 'Q-DEMO')),
        'Please find our quotation attached. Valid for 30 days.',
        format('Dear Customer,\n\nPlease find quotation %s attached.\n\nBest regards,\nDemo PIC', coalesce(v_q_ref, 'Q-DEMO')),
        now() - interval '3 days',
        v_sent_q, 'quotation', v_q_id, true
      )
      on conflict (tenant_id, gmail_message_id) do nothing;
    end if;

    if v_so_id is not null then
      insert into public.com_sent_messages (
        tenant_id, channel, doc_type, doc_id, to_addrs, subject, body_text,
        status, sent_by_user_id, gmail_message_id, gmail_thread_id, created_at
      ) values (
        v_tenant, 'email', 'sales_order', v_so_id,
        jsonb_build_array('buyer@demo-customer.test'),
        format('DEMO-COMMS-SO: %s', coalesce(v_so_no, 'SO-DEMO')),
        format('Sales order %s is confirmed. Delivery schedule attached.', coalesce(v_so_no, 'SO-DEMO')),
        'sent', v_user_id, 'demo-gmail-msg-so-001', 'demo-gmail-thread-so-001',
        now() - interval '2 days'
      )
      returning id into v_sent_so;

      insert into public.com_thread_links (sent_message_id, doc_type, doc_id)
      values (v_sent_so, 'sales_order', v_so_id);

      insert into public.com_mail_messages (
        tenant_id, owner_user_id, gmail_message_id, gmail_thread_id, direction,
        from_addr, to_addrs, subject, snippet, internal_date,
        sent_message_id, linked_doc_type, linked_doc_id, is_stub
      ) values (
        v_tenant, v_user_id, 'demo-gmail-msg-so-001', 'demo-gmail-thread-so-001', 'outbound',
        'sales@demo-tenant.test',
        jsonb_build_array('buyer@demo-customer.test'),
        format('Sales Order %s confirmed', coalesce(v_so_no, 'SO-DEMO')),
        'Your sales order is confirmed. Delivery schedule attached.',
        now() - interval '2 days',
        v_sent_so, 'sales_order', v_so_id, true
      )
      on conflict (tenant_id, gmail_message_id) do nothing;
    end if;

    if v_po_id is not null then
      insert into public.com_sent_messages (
        tenant_id, channel, doc_type, doc_id, to_addrs, subject, body_text,
        status, sent_by_user_id, gmail_message_id, gmail_thread_id, created_at
      ) values (
        v_tenant, 'email', 'purchase_order', v_po_id,
        jsonb_build_array('orders@demo-vendor.test'),
        format('DEMO-COMMS-PO: %s', coalesce(v_po_no, 'PO-DEMO')),
        format('Please acknowledge PO %s and confirm lead time.', coalesce(v_po_no, 'PO-DEMO')),
        'sent', v_user_id, 'demo-gmail-msg-po-001', 'demo-gmail-thread-po-001',
        now() - interval '1 day'
      )
      returning id into v_sent_po;

      insert into public.com_thread_links (sent_message_id, doc_type, doc_id)
      values (v_sent_po, 'purchase_order', v_po_id);

      insert into public.com_mail_messages (
        tenant_id, owner_user_id, gmail_message_id, gmail_thread_id, direction,
        from_addr, to_addrs, subject, snippet, internal_date,
        sent_message_id, linked_doc_type, linked_doc_id, is_stub
      ) values (
        v_tenant, v_user_id, 'demo-gmail-msg-po-001', 'demo-gmail-thread-po-001', 'outbound',
        'procurement@demo-tenant.test',
        jsonb_build_array('orders@demo-vendor.test'),
        format('PO %s — please confirm', coalesce(v_po_no, 'PO-DEMO')),
        'Please acknowledge this purchase order and confirm lead time.',
        now() - interval '1 day',
        v_sent_po, 'purchase_order', v_po_id, true
      )
      on conflict (tenant_id, gmail_message_id) do nothing;
    end if;

    if v_si_id is not null then
      insert into public.com_sent_messages (
        tenant_id, channel, doc_type, doc_id, to_addrs, subject, body_text,
        status, sent_by_user_id, created_at
      ) values (
        v_tenant, 'email', 'sales', v_si_id,
        jsonb_build_array('accounts@demo-customer.test'),
        format('DEMO-COMMS-SI: %s', coalesce(v_si_no, 'SI-DEMO')),
        format('Invoice %s — payment due in 30 days.', coalesce(v_si_no, 'SI-DEMO')),
        'sent', v_user_id,
        now() - interval '12 hours'
      )
      returning id into v_sent_si;

      insert into public.com_thread_links (sent_message_id, doc_type, doc_id)
      values (v_sent_si, 'sales', v_si_id);
    end if;

    -- Inbound stub reply linked to quotation thread (inbox demo without Gmail OAuth).
    if v_q_id is not null then
      insert into public.com_mail_messages (
        tenant_id, owner_user_id, gmail_message_id, gmail_thread_id, direction,
        from_addr, to_addrs, subject, snippet, body_text, internal_date,
        linked_doc_type, linked_doc_id, is_stub
      ) values (
        v_tenant, v_user_id, 'demo-gmail-msg-q-reply-001', 'demo-gmail-thread-q-001', 'inbound',
        'procurement@demo-customer.test',
        jsonb_build_array('sales@demo-tenant.test'),
        format('RE: Quotation %s — please revise qty', coalesce(v_q_ref, 'Q-DEMO')),
        'Can you revise line 2 quantity to 8 units? Thanks.',
        E'Team,\n\nCan you revise line 2 quantity to 8 units?\n\nThanks,\nProcurement',
        now() - interval '2 days',
        'quotation', v_q_id, true
      )
      on conflict (tenant_id, gmail_message_id) do nothing;
    end if;

    raise notice 'seed-demo-comms: seeded sent messages and stub inbox for %', v_code;
  end loop;
end $$;

commit;
