-- POS payment modes: broaden tender types (e-wallets, QR, bank transfer) and default allowed tenders.
begin;

-- Relax the tender_type check constraint to record the specific payment mode used at checkout.
alter table public.pos_tenders
  drop constraint if exists pos_tenders_tender_type_check;

alter table public.pos_tenders
  add constraint pos_tenders_tender_type_check
  check (tender_type in ('cash', 'gcash', 'maya', 'qrph', 'card', 'bank_transfer', 'other'));

-- New tenants get the fuller set of common Philippine payment methods by default.
alter table public.pos_settings
  alter column allowed_tenders
  set default '["cash","gcash","maya","qrph","card","bank_transfer"]'::jsonb;

-- Upgrade existing rows that still use the original default so the new modes are selectable.
update public.pos_settings
set allowed_tenders = '["cash","gcash","maya","qrph","card","bank_transfer"]'::jsonb,
    updated_at = now()
where allowed_tenders = '["cash","card"]'::jsonb;

commit;
