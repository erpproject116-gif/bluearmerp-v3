-- Create inv_item_categories before 101 needs it.
--
-- 101_sales_commission_qms_portal.sql declares
--   item_category_id bigint references public.inv_item_categories(id)
-- but that table was first created in 105_tin_item_categories.sql, whose header
-- already notes it "fixes migration 101 FK". That ordering works on a database
-- built up over time, because the table was present by the time 101 ran there.
-- It does not work on a fresh database: 101 aborts, and 104, 175, 176, 198 and
-- the demo seed all fail behind it.
--
-- This file is deliberately additive and sorts between 100_ and 101_. On any
-- database that already has the table it is a no-op; 105 remains unchanged and
-- is also a no-op for this table. Only the depends-on-tenants part is moved
-- here - defaults, indexes, permissions and backfill stay in 105.
begin;

create table if not exists public.inv_item_categories (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(50) not null,
  name varchar(255) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

commit;
