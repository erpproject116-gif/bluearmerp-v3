-- Journal entry reverse + archive support.
-- archived_at is a UI soft-hide only: reports keep reading status = 'posted',
-- so archiving never changes the general ledger.
alter table public.fin_journal_entries
  add column if not exists archived_at timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_of_entry_id bigint references public.fin_journal_entries(id) on delete set null,
  add column if not exists reversed_by_entry_id bigint references public.fin_journal_entries(id) on delete set null;

create index if not exists idx_fin_journal_entries_archived
  on public.fin_journal_entries (tenant_id, archived_at);

create index if not exists idx_fin_journal_entries_reversal_of
  on public.fin_journal_entries (reversal_of_entry_id);
