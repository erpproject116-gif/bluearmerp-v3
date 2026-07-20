-- Set Pacific Rim Modular Furnishing Corp. owner to erpproject116@gmail.com
begin;

do $$
declare
  v_tenant_id bigint;
  v_user_id bigint;
  v_auth_id uuid;
  v_email text := 'erpproject116@gmail.com';
  v_name text := 'ERP Project';
  v_role text;
begin
  select t.id into v_tenant_id
  from public.tenants t
  where t.company_name ilike '%Pacific Rim Modular%'
  order by t.id
  limit 1;

  if v_tenant_id is null then
    raise exception 'Tenant not found: Pacific Rim Modular Furnishing Corp.';
  end if;

  select u.id into v_user_id
  from public.users u
  where u.tenant_id = v_tenant_id
    and lower(u.email) = lower(v_email)
  limit 1;

  select u.auth_user_id into v_auth_id
  from public.users u
  where lower(u.email) = lower(v_email)
    and u.auth_user_id is not null
  order by u.id
  limit 1;

  if v_auth_id is null then
    select au.id into v_auth_id
    from auth.users au
    where lower(au.email) = lower(v_email)
    limit 1;
  end if;

  select coalesce(
    (select role_code from public.tenant_roles where tenant_id = v_tenant_id and role_code = 'store_admin' limit 1),
    (select role_code from public.tenant_roles where tenant_id = v_tenant_id order by role_code limit 1),
    'member'
  ) into v_role;

  if v_user_id is null then
    insert into public.users (tenant_id, email, full_name, status, auth_user_id, tenant_role)
    values (v_tenant_id, v_email, v_name, 'active', v_auth_id, v_role)
    on conflict (tenant_id, email) do update
      set status = 'active',
          full_name = excluded.full_name,
          auth_user_id = coalesce(public.users.auth_user_id, excluded.auth_user_id),
          tenant_role = excluded.tenant_role,
          updated_at = now()
    returning id into v_user_id;
  else
    update public.users
    set status = 'active',
        auth_user_id = coalesce(auth_user_id, v_auth_id),
        tenant_role = v_role,
        updated_at = now()
    where id = v_user_id;
  end if;

  if v_user_id is null then
    select u.id into v_user_id
    from public.users u
    where u.tenant_id = v_tenant_id and lower(u.email) = lower(v_email)
    limit 1;
  end if;

  if v_user_id is null then
    raise exception 'Could not resolve user % on Pacific Rim tenant', v_email;
  end if;

  update public.tenants
  set owner_user_id = v_user_id,
      updated_at = now()
  where id = v_tenant_id;

  raise notice 'Pacific Rim tenant_id=% owner_user_id=% email=%', v_tenant_id, v_user_id, v_email;
end $$;

select
  t.id as tenant_id,
  t.company_name,
  t.owner_user_id,
  u.email as owner_email,
  u.full_name,
  u.status,
  u.tenant_role
from public.tenants t
join public.users u on u.id = t.owner_user_id
where t.company_name ilike '%Pacific Rim Modular%';

commit;
