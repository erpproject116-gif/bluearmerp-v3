-- The one-time repair reversed unfinished sales and purchase journals and
-- left both legs posted. The reversal stayed on the active journal list with
-- an "Unfinished ..." remark. Cancel and archive the reversal and the original
-- so they leave the active register and every posted report (general ledger,
-- trial balance). They remain under the Archived status.
update public.fin_journal_entries je
set status = 'cancelled',
    archived_at = coalesce(je.archived_at, now()),
    updated_at = now()
where je.status = 'posted'
  and (
    je.remarks in (
      'Unfinished sale journal reversed because the document is not completed',
      'Unfinished purchase journal reversed because the document is not completed'
    )
    or je.reversed_by_entry_id in (
      select id from public.fin_journal_entries
      where remarks in (
        'Unfinished sale journal reversed because the document is not completed',
        'Unfinished purchase journal reversed because the document is not completed'
      )
    )
  );
