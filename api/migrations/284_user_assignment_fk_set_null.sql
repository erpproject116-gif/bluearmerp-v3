-- Follow-up to 283: assignment FKs like pos_sessions.cashier_user_id were skipped
-- (NOT NULL and not *_by_user_id), but they still block tenant wipe when users cascade.
-- Prefer ON DELETE SET NULL so deleting a cashier does not destroy POS session history.

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      cl.relname as table_name,
      c.conname as constraint_name,
      a.attname as column_name,
      a.attnotnull as column_not_null
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class cl on cl.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = cl.relnamespace
    join lateral unnest(c.conkey) with ordinality as u(attnum, ord) on true
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = u.attnum and not a.attisdropped
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confrelid = 'public.users'::regclass
      and c.confdeltype in ('a', 'r')
      and cardinality(c.conkey) = 1
      and (
        a.attname ~ '_user_id$'
        or a.attname in ('changed_by')
      )
      -- Membership keys stay CASCADE; leave bare user_id for a separate pass if needed.
      and a.attname <> 'user_id'
    order by cl.relname, a.attname
  loop
    if r.column_not_null then
      execute format(
        'alter table %I.%I alter column %I drop not null',
        r.schema_name, r.table_name, r.column_name
      );
    end if;

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.constraint_name
    );
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references public.users(id) on delete set null',
      r.schema_name, r.table_name, r.constraint_name, r.column_name
    );
  end loop;
end $$;
