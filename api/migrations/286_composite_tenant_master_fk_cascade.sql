-- Composite FKs into tenant-scoped tables (skipped by 285 which only handled single-column FKs).
-- Example: users (tenant_id, tenant_role) → tenant_roles (tenant_id, role_code) NO ACTION
-- blocks tenant wipe when roles and users cascade in either order.
-- Use ON DELETE CASCADE for multi-column FKs (cannot SET NULL a composite key cleanly).

begin;

do $$
declare
  r record;
  cols text;
  ref_cols text;
begin
  for r in
    select
      n.nspname as schema_name,
      cl.relname as table_name,
      c.conname as constraint_name,
      c.oid as constraint_oid,
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
      and cardinality(c.conkey) > 1
      and ref.relname not in ('tenants', 'users')
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
end $$;

commit;
