-- =============================================================================
-- Repair platform superadmin + BLUEARM owner for bootstrap Gmail accounts
-- =============================================================================
-- Use when auth_user_id is linked on public.users but platform_users is missing
-- or platform_role is not superadmin (e.g. linked before link-platform-owners.sql).
--
-- Prerequisite: scripts/seed-platform-owners.sql + Google sign-in (auth.users row).
-- Safe to re-run.
-- =============================================================================

begin;

do $$
declare
  r record;
  v_auth_id uuid;
begin
  for r in
    select *
    from (
      values
        ('itsjohnranel@gmail.com'::text, 'John Ranel'::text),
        ('bluearmph@gmail.com'::text, 'Bluearm PH'::text)
    ) as m(gmail, display_name)
  loop
    select u.auth_user_id
    into v_auth_id
    from public.users u
    join public.tenants t on t.id = u.tenant_id
    where t.company_code = 'BLUEARM'
      and lower(u.email) = lower(r.gmail)
      and u.auth_user_id is not null
    limit 1;

    if v_auth_id is null then
      select au.id
      into v_auth_id
      from auth.users au
      where lower(au.email) = lower(r.gmail)
      limit 1;
    end if;

    if v_auth_id is null then
      raise warning 'repair-platform-owners: no linked user for % — sign in with Google once, run seed-platform-owners.sql, then re-run link-platform-owners.sql.', r.gmail;
      continue;
    end if;

    delete from public.platform_users
    where lower(email) = lower(r.gmail)
      and auth_user_id <> v_auth_id;

    insert into public.platform_users (auth_user_id, email, full_name, role, is_active)
    select
      v_auth_id,
      r.gmail,
      coalesce(
        nullif(trim(u.full_name), ''),
        nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(au.raw_user_meta_data->>'name'), ''),
        r.display_name
      ),
      'superadmin',
      true
    from auth.users au
    left join public.users u on u.auth_user_id = au.id
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
        and u.auth_user_id = v_auth_id
        and t.owner_user_id is distinct from u.id;
    end if;

    raise notice 'repair-platform-owners: ensured superadmin for %', r.gmail;
  end loop;
end $$;

select
  u.email,
  u.auth_user_id is not null as auth_linked,
  t.company_code,
  t.owner_user_id = u.id as is_tenant_owner,
  pu.role as platform_role,
  pu.is_active as platform_active
from public.users u
join public.tenants t on t.id = u.tenant_id
left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
where t.company_code = 'BLUEARM'
order by u.email;

commit;
