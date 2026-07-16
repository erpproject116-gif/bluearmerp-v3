-- Restrict platform_users to the three Platform console owner emails.
-- Non-allowlisted rows lose console access even if previously seeded.
begin;

delete from public.platform_users
where lower(email) not in (
  'itsjohnranel@gmail.com',
  'bluearmph@gmail.com',
  'erpproject116@gmail.com'
);

commit;
