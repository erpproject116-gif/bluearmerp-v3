-- Isolate commercial ownership from support ghosts (tenant 31 Magno incident).
-- Support ghosts keep store_admin + superadmin scan; they must never become
-- tenants.owner_user_id on customer workspaces. BLUEARM operator stays owned
-- by bluearmph@gmail.com.
begin;

-- One-time repair: where a non-BLUEARM tenant is owned by a platform console
-- email / support ghost / disabled ghost row, restore ownership to the linked
-- billing contact, else earliest active non-support member.
with ranked as (
  select
    t.id as tenant_id,
    u.id as user_id,
    row_number() over (
      partition by t.id
      order by
        case when lower(u.email) = lower(pc.email) then 0 else 1 end,
        case when u.tenant_role = 'store_admin' then 0 else 1 end,
        u.id
    ) as rn
  from public.tenants t
  join public.users o on o.id = t.owner_user_id
  left join public.platform_customers pc
    on pc.tenant_id = t.id
  join public.users u
    on u.tenant_id = t.id
   and u.status = 'active'
   and u.support_session_id is null
   and lower(u.email) not in ('bluearmph@gmail.com', 'itsjohnranel@gmail.com', 'erpproject116@gmail.com')
   and u.email not ilike '%+support@%'
   and coalesce(u.full_name, '') not ilike 'Bluearm Support%'
  where t.company_code <> 'BLUEARM'
    and (
      lower(o.email) in ('bluearmph@gmail.com', 'itsjohnranel@gmail.com', 'erpproject116@gmail.com')
      or o.email ilike '%+support@%'
      or coalesce(o.full_name, '') ilike 'Bluearm Support%'
      or (o.status = 'disabled' and o.support_session_id is not null)
      or (o.status = 'disabled' and coalesce(o.full_name, '') ilike 'Bluearm Support%')
    )
)
update public.tenants t
set owner_user_id = r.user_id, updated_at = now()
from ranked r
where t.id = r.tenant_id
  and r.rn = 1
  and t.owner_user_id is distinct from r.user_id;

-- Guard: block future ownership theft on customer workspaces.
create or replace function public.prevent_support_owner_theft()
returns trigger
language plpgsql
as $$
declare
  v_email text;
  v_full_name text;
  v_status text;
  v_support_session bigint;
  v_code text;
begin
  if new.owner_user_id is null or new.owner_user_id = old.owner_user_id then
    return new;
  end if;
  select t.company_code into v_code from public.tenants t where t.id = new.id;
  if v_code = 'BLUEARM' then
    return new;
  end if;
  select u.email, coalesce(u.full_name, ''), u.status, u.support_session_id
    into v_email, v_full_name, v_status, v_support_session
  from public.users u
  where u.id = new.owner_user_id;
  if v_support_session is not null then
    raise exception 'Cannot set workspace owner to an active support ghost user.';
  end if;
  if lower(coalesce(v_email, '')) in ('bluearmph@gmail.com', 'itsjohnranel@gmail.com', 'erpproject116@gmail.com') then
    raise exception 'Platform superadmins cannot own customer workspace %.', v_code;
  end if;
  if v_email ilike '%+support@%' or v_full_name ilike 'Bluearm Support%' then
    raise exception 'Support ghost users cannot own customer workspace %.', v_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_support_owner_theft on public.tenants;
create trigger trg_prevent_support_owner_theft
  before update of owner_user_id on public.tenants
  for each row
  execute function public.prevent_support_owner_theft();

commit;
