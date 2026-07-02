-- Budget control mode on process policies
alter table public.tenant_process_policies
  add column if not exists budget_control_mode text not null default 'off'
    check (budget_control_mode in ('off', 'warn', 'block'));
