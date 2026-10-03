-- POS catalog curation: hide items from terminal without deleting from inventory.
alter table public.inv_items
  add column if not exists pos_visible boolean not null default true;

comment on column public.inv_items.pos_visible is
  'When false, item is hidden from POS terminal catalog (Manage can toggle). Default true for existing items.';

create index if not exists idx_inv_items_pos_visible
  on public.inv_items (tenant_id, pos_visible)
  where deleted_at is null and status = 'active';
