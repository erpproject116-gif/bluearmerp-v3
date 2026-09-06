-- Lot event ledger for Lot Inv. Book (ECOUNT Serial/Lot No. Inv. Book lot grain).
begin;

create table if not exists public.inv_lot_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  lot_batch_id bigint not null references public.inv_lot_batches(id) on delete cascade,
  event_type text not null check (event_type in (
    'received', 'transferred', 'sold', 'returned', 'adjusted', 'consumed', 'produced', 'voided'
  )),
  from_location_id bigint references public.inv_locations(id),
  to_location_id bigint references public.inv_locations(id),
  qty numeric(18,4) not null check (qty > 0),
  ref_type varchar(80),
  ref_id bigint,
  notes text,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inv_lot_events_batch
  on public.inv_lot_events (lot_batch_id, created_at desc);

create index if not exists idx_inv_lot_events_tenant
  on public.inv_lot_events (tenant_id, created_at desc);

-- Cutover seed so Lot Inv. Book has a starting balance for existing stock.
insert into public.inv_lot_events (
  tenant_id, lot_batch_id, event_type, to_location_id, qty, ref_type, notes
)
select
  lb.tenant_id,
  lb.id,
  'received',
  lb.location_id,
  lb.qty_on_hand,
  'opening_cutover',
  'Seeded from qty_on_hand at migration 282'
from public.inv_lot_batches lb
where lb.qty_on_hand > 0
  and not exists (
    select 1 from public.inv_lot_events e where e.lot_batch_id = lb.id
  );

commit;
