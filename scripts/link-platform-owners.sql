-- =============================================================================
-- Link Google accounts → BLUEARM tenant owners + platform_users (superadmin)
-- =============================================================================
-- Run AFTER:
--   1. Migrations (001–003)
--   2. supabase/seed.sql
--   3. scripts/seed-platform-owners.sql
--
-- Prerequisite: each Gmail must exist in auth.users (sign in once with Google).
-- Missing accounts are skipped with WARNING; sign in then re-run.
-- =============================================================================

begin;

do $$
declare
  r record;
  v_auth_id uuid;
  v_updated int;
  v_tenant_id bigint;
begin
  select t.id into v_tenant_id
  from public.tenants t
  where t.company_code = 'BLUEARM'
  limit 1;

  if v_tenant_id is null then
    raise exception 'link-platform-owners: BLUEARM tenant missing — run scripts/seed-platform-owners.sql first.';
  end if;

  for r in
    select *
    from (
      values
        ('itsjohnranel@gmail.com'::text, 'John Ranel'::text),
        ('bluearmph@gmail.com'::text, 'Bluearm PH'::text),
        ('erpproject116@gmail.com'::text, 'ERP Project'::text)
    ) as m(gmail, display_name)
  loop
    select au.id
    into v_auth_id
    from auth.users au
    where lower(au.email) = lower(r.gmail)
    limit 1;

    if v_auth_id is null then
      raise warning 'link-platform-owners: no auth.users row for % — sign in with Google once, then re-run.', r.gmail;
      continue;
    end if;

    -- Clear stale auth links on other rows
    update public.users u
    set auth_user_id = null, updated_at = now()
    where u.auth_user_id = v_auth_id
      and u.id <> (
        select u2.id from public.users u2
        where u2.tenant_id = v_tenant_id and lower(u2.email) = lower(r.gmail)
        limit 1
      );

    update public.users u
    set
      auth_user_id = v_auth_id,
      email = r.gmail,
      full_name = coalesce(
        nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(au.raw_user_meta_data->>'name'), ''),
        r.display_name
      ),
      status = 'active',
      updated_at = now()
    from auth.users au
    where au.id = v_auth_id
      and u.tenant_id = v_tenant_id
      and lower(u.email) = lower(r.gmail);

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise warning
        'link-platform-owners: expected 1 users row for % on BLUEARM; updated %. Run seed-platform-owners.sql first.',
        r.gmail,
        v_updated;
      continue;
    end if;

    insert into public.platform_users (auth_user_id, email, full_name, role, is_active)
    select
      v_auth_id,
      r.gmail,
      coalesce(
        nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(au.raw_user_meta_data->>'name'), ''),
        r.display_name
      ),
      'superadmin',
      true
    from auth.users au
    where au.id = v_auth_id
    on conflict (auth_user_id) do update
    set
      email = excluded.email,
      full_name = excluded.full_name,
      role = 'superadmin',
      is_active = true;

    if lower(r.gmail) = 'bluearmph@gmail.com' then
      update public.tenants t
      set owner_user_id = u.id, updated_at = now()
      from public.users u
      where t.company_code = 'BLUEARM'
        and u.tenant_id = t.id
        and lower(u.email) = lower(r.gmail)
        and t.owner_user_id is distinct from u.id;
    end if;

    raise notice 'link-platform-owners: linked % → BLUEARM + platform_users (superadmin)', r.gmail;
  end loop;
end $$;

select
  u.id as user_id,
  u.email,
  u.auth_user_id,
  t.company_code,
  t.auto_enable_all_modules,
  pu.role as platform_role,
  pu.is_active as platform_active
from public.users u
join public.tenants t on t.id = u.tenant_id
left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
where t.company_code = 'BLUEARM'
order by u.email;

commit;
