-- Tenant wipe deletes users via tenants → users ON DELETE CASCADE.
-- Audit FKs to users that default to NO ACTION (e.g. so_sales_order_attachments.uploaded_by_user_id)
-- block that cascade when sibling rows still reference the user.
-- Align with newer attachment tables: ON DELETE SET NULL.

do $$
declare
  r record;
  is_audit boolean;
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
      and c.confdeltype in ('a', 'r') -- NO ACTION / RESTRICT
      and cardinality(c.conkey) = 1
    order by cl.relname, a.attname
  loop
    is_audit :=
      r.column_name ~ '_by_user_id$'
      or r.column_name in (
        'actor_user_id',
        'sender_user_id',
        'changed_by',
        'owner_user_id',
        'tic_user_id',
        'pic_user_id',
        'locked_by_user_id',
        'inspected_by_user_id'
      );

    -- Leave membership / assignment NOT NULL user_id FKs alone (expect ON DELETE CASCADE elsewhere).
    if not is_audit and r.column_not_null then
      continue;
    end if;

    -- Nullable non-audit columns still get SET NULL so wipe is not blocked by stray refs.
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
