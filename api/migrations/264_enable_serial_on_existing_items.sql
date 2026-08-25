-- Enable serial tracking on existing items (same default as new items).
-- Skip lot-tracked rows (inv_items_track_serial_lot_exclusive forbids both).
-- Soft-deleted items are left unchanged.
begin;

update public.inv_items
set track_serial = true,
    track_inventory_qty = true,
    serial_policy = case
      when serial_policy in ('optional', 'required') then serial_policy
      else 'optional'
    end,
    updated_at = now()
where deleted_at is null
  and coalesce(track_lot, false) = false
  and coalesce(track_serial, false) = false;

commit;
