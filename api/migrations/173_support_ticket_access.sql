-- Support ticket row-level access: members file/view own tickets; IT (tickets_assign write) sees all.
begin;

update public.permission_registry
set label = 'Manage All Tickets (IT)'
where permission_code = 'support.tickets_assign';

-- Members do not need assign permission; IT desk uses store_admin or explicit tickets_assign write.
update public.tenant_role_permissions
set access_level = 'deny'
where role_code = 'member'
  and permission_code = 'support.tickets_assign';

commit;
