-- Soft-delete demo inventory masters for the scoped demo tenant.
-- Run AFTER purge-demo-data.sql so transactional FKs are already cleared.
-- Keeps tax types, users, CoA, and CRM alert rules.
-- Soft-delete matches app delete semantics (lists filter deleted_at is null).
-- Populate restores rows via seed ON CONFLICT DO UPDATE (deleted_at cleared).
begin;

do $$
declare
  v_tenant bigint;
  v_code text;
begin
  foreach v_code in array (case when nullif(current_setting('app.demo_tenant', true), '') is null then array['DEMO000', 'BLUEARM'] else array(select company_code from public.tenants where id = nullif(current_setting('app.demo_tenant', true), '')::bigint) end)
  loop
    select id into v_tenant from public.tenants where company_code = v_code;
    if v_tenant is null then
      raise notice 'purge-demo-masters: tenant % missing — skip', v_code;
      continue;
    end if;

    raise notice 'purge-demo-masters: soft-deleting masters for % (tenant_id=%)', v_code, v_tenant;

    -- Drop demo bank fixtures that survive transactional purge
    delete from public.fin_bank_statement_lines
    where tenant_id = v_tenant
      and bank_account_id in (
        select id from public.fin_bank_accounts
        where tenant_id = v_tenant and bank_account_code = 'DEMO-BDO'
      );

    delete from public.fin_bank_accounts
    where tenant_id = v_tenant and bank_account_code = 'DEMO-BDO';

    -- Clear self-refs on items before soft-delete
    update public.inv_items
    set default_location_id = null, updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    update public.inv_partners
    set deleted_at = now(), status = 'inactive', updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    update public.inv_items
    set deleted_at = now(), status = 'inactive', updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    update public.inv_locations
    set deleted_at = now(), status = 'inactive', updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    update public.inv_projects
    set deleted_at = now(), status = 'inactive', updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    update public.inv_departments
    set deleted_at = now(), status = 'inactive', updated_at = now()
    where tenant_id = v_tenant and deleted_at is null;

    raise notice 'purge-demo-masters: done for %', v_code;
  end loop;
end $$;

commit;
