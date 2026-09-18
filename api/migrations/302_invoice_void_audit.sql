-- Invoice void: "delete invoice" voids the accounting voucher and keeps the audit
-- trail. Stock movements, serials and lots are never reversed in v1.
-- Also ensures journal reverse/archive columns exist so void can reverse posted JEs
-- even if migration 301 has not been applied yet.
begin;

alter table public.fin_journal_entries
  add column if not exists archived_at timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_of_entry_id bigint references public.fin_journal_entries(id) on delete set null,
  add column if not exists reversed_by_entry_id bigint references public.fin_journal_entries(id) on delete set null;

create index if not exists idx_fin_journal_entries_archived
  on public.fin_journal_entries (tenant_id, archived_at);

create index if not exists idx_fin_journal_entries_reversal_of
  on public.fin_journal_entries (reversal_of_entry_id);

alter table public.document_lifecycle_actions
  drop constraint if exists document_lifecycle_actions_action_check;

alter table public.document_lifecycle_actions
  add constraint document_lifecycle_actions_action_check
  check (action in ('delete', 'restore', 'void'));

commit;
