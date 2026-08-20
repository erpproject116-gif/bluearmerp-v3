-- Link generated expenses back to their recurring schedule.
begin;

alter table public.fin_expenses
  add column if not exists recurring_expense_id bigint
    references public.fin_recurring_expenses(id);

create index if not exists idx_fin_expenses_recurring
  on public.fin_expenses (tenant_id, recurring_expense_id)
  where deleted_at is null and recurring_expense_id is not null;

commit;
