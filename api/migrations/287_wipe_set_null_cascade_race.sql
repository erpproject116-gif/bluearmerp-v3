-- Tenant wipe deletes both document parents (CASCADE) and tenant masters
-- (inv_locations / inv_items / …). Migration 285 rewrote many master FKs to
-- ON DELETE SET NULL. When the same child also has ON DELETE CASCADE to a
-- document parent, Postgres may SET NULL-UPDATE the child after the parent
-- row is already gone, which re-checks the CASCADE FK and fails with:
--   insert or update on "<child>" violates foreign key "<…_fkey>"
-- Observed: so_sales_order_release_lines.location_id SET NULL racing
-- sales_order_line_id CASCADE.
--
-- Fix: on tables that already CASCADE-delete from a document parent, change
-- SET NULL FKs into tenant-cascaded masters to ON DELETE CASCADE instead.
-- Also cascade dangling NO ACTION FKs that reference those children
-- (e.g. wms_scheduled_releases → so_sales_order_release_lines).

begin;

do $$
declare
  r record;
  cols text;
  ref_cols text;
begin
  -- 1) SET NULL → CASCADE for master FKs on CASCADE-owned document children.
  for r in
    select
      n.nspname as schema_name,
      cl.relname as table_name,
      c.conname as constraint_name,
      c.conrelid as table_oid,
      c.confrelid as ref_oid,
      ref.relname as ref_table,
      c.conkey,
      c.confkey,
      c.oid as constraint_oid
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    join pg_catalog.pg_class ref on ref.oid = c.confrelid
    join pg_catalog.pg_namespace rn on rn.oid = ref.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'public'
      and c.confdeltype = 'n' -- SET NULL
      and cardinality(c.conkey) = 1
      and ref.relname not in ('tenants', 'users')
      -- Same table also has at least one CASCADE FK (document parent).
      and exists (
        select 1
        from pg_catalog.pg_constraint c2
        where c2.conrelid = c.conrelid
          and c2.contype = 'f'
          and c2.confdeltype = 'c'
          and c2.oid <> c.oid
      )
      -- Referenced table is tenant-cascaded.
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
    order by cl.relname, c.conname
  loop
    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
    into cols
    from unnest(r.conkey) with ordinality as u(attnum, ord)
    join pg_catalog.pg_attribute a
      on a.attrelid = r.table_oid and a.attnum = u.attnum and not a.attisdropped;

    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
    into ref_cols
    from unnest(r.confkey) with ordinality as u(attnum, ord)
    join pg_catalog.pg_attribute a
      on a.attrelid = r.ref_oid and a.attnum = u.attnum and not a.attisdropped;

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%s) references public.%I (%s) on delete cascade',
      r.schema_name, r.table_name, r.constraint_name, cols, r.ref_table, ref_cols
    );
  end loop;

  -- 2) NO ACTION / RESTRICT FKs into those CASCADE-owned children → CASCADE
  --    so wipe is not blocked after children start cascading.
  for r in
    select
      n.nspname as schema_name,
      cl.relname as table_name,
      c.conname as constraint_name,
      c.conrelid as table_oid,
      c.confrelid as ref_oid,
      ref.relname as ref_table,
      c.conkey,
      c.confkey
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    join pg_catalog.pg_class ref on ref.oid = c.confrelid
    join pg_catalog.pg_namespace rn on rn.oid = ref.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'public'
      and c.confdeltype in ('a', 'r')
      and ref.relname in (
        'so_sales_order_release_lines',
        'so_sales_order_lines',
        'so_sales_orders',
        'dr_delivery_receipt_lines',
        'dr_delivery_receipts',
        'pr_purchase_request_lines',
        'pr_purchase_requests',
        'po_purchase_order_lines',
        'po_purchase_orders',
        'sa_sales_lines',
        'sa_sales'
      )
    order by cl.relname, c.conname
  loop
    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
    into cols
    from unnest(r.conkey) with ordinality as u(attnum, ord)
    join pg_catalog.pg_attribute a
      on a.attrelid = r.table_oid and a.attnum = u.attnum and not a.attisdropped;

    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
    into ref_cols
    from unnest(r.confkey) with ordinality as u(attnum, ord)
    join pg_catalog.pg_attribute a
      on a.attrelid = r.ref_oid and a.attnum = u.attnum and not a.attisdropped;

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%s) references public.%I (%s) on delete cascade',
      r.schema_name, r.table_name, r.constraint_name, cols, r.ref_table, ref_cols
    );
  end loop;
end $$;

commit;
