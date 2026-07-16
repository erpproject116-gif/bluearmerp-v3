-- Tenant may hide unused CoA account types from create/mapping pickers.
begin;

alter table public.tenant_finance_defaults
  add column if not exists disabled_account_types text[] not null default '{}';

commit;
