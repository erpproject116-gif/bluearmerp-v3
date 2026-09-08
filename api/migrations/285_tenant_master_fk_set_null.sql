-- Tenant wipe deletes inv_partners / inv_items / inv_locations (etc.) via tenants CASCADE.
-- Document FKs into those masters with ON DELETE NO ACTION race the cascade
-- (e.g. pr_purchase_request_lines.partner_id → inv_partners).
--
-- Nullable / non-key columns → ON DELETE SET NULL
-- Primary-key / unique-key columns (e.g. sa_collective_invoice_sales.sales_id) → ON DELETE CASCADE
-- (cannot DROP NOT NULL on a PK column).

begin;

do $$
declare
  r record;
  is_key boolean;
  del_action text;
begin
  for r in
    select
      n.nspname as schema_name,
      cl.relname as table_name,
      c.conname as constraint_name,
      a.attname as column_name,
      a.attnotnull as column_not_null,
      a.attnum as column_attnum,
      cl.oid as table_oid,
      ref.relname as ref_table
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    join pg_catalog.pg_class ref on ref.oid = c.confrelid
    join pg_catalog.pg_namespace rn on rn.oid = ref.relnamespace
    join lateral unnest(c.conkey) with ordinality as u(attnum, ord) on true
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = u.attnum and not a.attisdropped
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'public'
      and c.confdeltype in ('a', 'r')
      and cardinality(c.conkey) = 1
      and ref.relname <> 'tenants'
      and ref.relname <> 'users'
      and exists (
        select 1
        from pg_catalog.pg_constraint tc
        join pg_catalog.pg_attribute ta
          on ta.attrelid = tc.conrelid and ta.attnum = any (tc.conkey) and not ta.attisdropped
        where tc.contype = 'f'
          and tc.conrelid = ref.oid
          and ta.attname = 'tenant_id'
          and tc.confrelid = 'public.tenants'::regclass
          and tc.confdeltype = 'c'
      )
    order by cl.relname, a.attname
  loop
    select exists (
      select 1
      from pg_catalog.pg_constraint kc
      where kc.conrelid = r.table_oid
        and kc.contype in ('p', 'u')
        and r.column_attnum = any (kc.conkey)
    ) into is_key;

    if is_key then
      del_action := 'cascade';
    else
      del_action := 'set null';
      if r.column_not_null then
        execute format(
          'alter table %I.%I alter column %I drop not null',
          r.schema_name, r.table_name, r.column_name
        );
      end if;
    end if;

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
      r.schema_name, r.table_name, r.constraint_name, r.column_name, r.ref_table, del_action
    );
  end loop;
end $$;

commit;
