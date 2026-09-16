-- Hide / remove Platform Command "customers" created from User Management invites.
-- Those are tenant staff, not billing customers.
begin;

-- Soft-clean: drop invite-sourced registry rows that never got a subscription.
-- Keep any invite row that somehow has subscription history (should be rare).
delete from public.platform_customers pc
where pc.entry_source = 'invite'
  and not exists (
    select 1
    from public.platform_subscriptions s
    where s.customer_id = pc.id
  );

commit;
