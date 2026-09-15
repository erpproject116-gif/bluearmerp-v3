-- Accrue expenses / retainers to GL and open-item surfaces.
begin;

alter table public.fin_expenses
  add column if not exists journal_entry_id bigint
    references public.fin_journal_entries(id) on delete set null;

create index if not exists idx_fin_expenses_journal_entry
  on public.fin_expenses (tenant_id, journal_entry_id)
  where journal_entry_id is not null and deleted_at is null;

alter table public.fin_retainer_invoices
  add column if not exists journal_entry_id bigint
    references public.fin_journal_entries(id) on delete set null;

create index if not exists idx_fin_retainer_invoices_journal_entry
  on public.fin_retainer_invoices (tenant_id, journal_entry_id)
  where journal_entry_id is not null and deleted_at is null;

alter table public.fin_retainer_invoices
  add column if not exists apply_journal_entry_id bigint
    references public.fin_journal_entries(id) on delete set null;

commit;
