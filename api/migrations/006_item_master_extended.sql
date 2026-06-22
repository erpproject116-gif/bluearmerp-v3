-- Extended item master fields for After-Sales item picker filters
begin;

alter table public.inv_items
  add column if not exists spec_name varchar(255),
  add column if not exists unit varchar(50),
  add column if not exists item_category text not null default 'merchandise'
    check (item_category in (
      'raw_material', 'sub_material', 'finished_goods', 'semi_finished_goods',
      'merchandise', 'intangible_merchandise'
    )),
  add column if not exists production_process text
    check (production_process is null or production_process in ('bundle', 'service')),
  add column if not exists item_type text not null default 'item'
    check (item_type in ('item', 'multiple_process_item', 'multi_spec_item')),
  add column if not exists track_inventory_qty boolean not null default false,
  add column if not exists inventory_qty numeric(18,4) not null default 0;

update public.inv_items
set item_category = 'merchandise', item_type = 'item'
where item_category is null or item_type is null;

create index if not exists idx_inv_items_category
  on public.inv_items (tenant_id, item_category)
  where deleted_at is null;

create index if not exists idx_inv_items_type
  on public.inv_items (tenant_id, item_type)
  where deleted_at is null;

commit;
