-- Serial/lot capture policy: optional vs required on transactions (ECount Management pill).
begin;

alter table public.inv_items
  add column if not exists serial_policy text not null default 'required'
    check (serial_policy in ('optional', 'required')),
  add column if not exists lot_policy text not null default 'required'
    check (lot_policy in ('optional', 'required'));

comment on column public.inv_items.serial_policy is 'When track_serial: optional allows saving without serials; required enforces capture.';
comment on column public.inv_items.lot_policy is 'When track_lot: optional allows saving without lot batch; required enforces capture.';

commit;
