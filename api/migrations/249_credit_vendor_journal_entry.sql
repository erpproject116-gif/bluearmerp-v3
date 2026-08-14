-- Link customer/vendor credits to their reverse journals (invoicejournal Sync).
begin;

alter table public.fin_credit_notes
  add column if not exists journal_entry_id bigint references public.fin_journal_entries(id);

alter table public.fin_vendor_credits
  add column if not exists journal_entry_id bigint references public.fin_journal_entries(id);

create index if not exists idx_fin_credit_notes_journal_entry
  on public.fin_credit_notes (tenant_id, journal_entry_id)
  where journal_entry_id is not null and deleted_at is null;

create index if not exists idx_fin_vendor_credits_journal_entry
  on public.fin_vendor_credits (tenant_id, journal_entry_id)
  where journal_entry_id is not null and deleted_at is null;

commit;
