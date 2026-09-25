-- Retire user groups as a permission layer.
-- Effective access becomes Role -> per-user Overrides. Any access a user had only
-- through a group is kept as a per-user override so nobody loses access; admins can
-- now see and remove it on Users -> Overrides. Group tables stay (deactivated) for a
-- later cleanup; nothing reads them after this release.
begin;

-- 1. Fold group grants into overrides where the group level beats the role level
--    and the user has no override for that permission yet. Company owners already
--    have full access and are skipped.
with active_members as (
  select gm.tenant_id, gm.user_id, gm.group_id
  from public.tenant_user_group_members gm
  join public.tenant_user_groups g on g.id = gm.group_id and g.is_active = true
  join public.users u on u.id = gm.user_id and u.tenant_id = gm.tenant_id
  join public.tenants t on t.id = gm.tenant_id
  where t.owner_user_id is distinct from u.id
),
group_max as (
  select am.tenant_id, am.user_id, gp.permission_code,
    max(case gp.access_level when 'write' then 2 when 'read' then 1 else 0 end) as group_rank
  from active_members am
  join public.tenant_user_group_permissions gp
    on gp.group_id = am.group_id and gp.tenant_id = am.tenant_id
  group by am.tenant_id, am.user_id, gp.permission_code
),
compared as (
  select gx.tenant_id, gx.user_id, gx.permission_code, gx.group_rank,
    coalesce(case trp.access_level when 'write' then 2 when 'read' then 1 else 0 end, 0) as role_rank
  from group_max gx
  join public.users u on u.id = gx.user_id
  left join public.tenant_role_permissions trp
    on trp.tenant_id = gx.tenant_id
   and trp.role_code = u.tenant_role
   and trp.permission_code = gx.permission_code
)
insert into public.user_permission_overrides (tenant_id, user_id, permission_code, access_level, updated_at)
select c.tenant_id, c.user_id, c.permission_code,
  case c.group_rank when 2 then 'write' else 'read' end,
  now()
from compared c
where c.group_rank > c.role_rank
on conflict (tenant_id, user_id, permission_code) do nothing;

-- 2. Force a permission refresh for every user who was in an active group.
update public.users u
set auth_revision = auth_revision + 1, updated_at = now()
where exists (
  select 1
  from public.tenant_user_group_members gm
  join public.tenant_user_groups g on g.id = gm.group_id and g.is_active = true
  where gm.user_id = u.id and gm.tenant_id = u.tenant_id
);

-- 3. Deactivate all groups. Tables are kept; nothing reads them after this release.
update public.tenant_user_groups
set is_active = false, updated_at = now()
where is_active = true;

commit;
