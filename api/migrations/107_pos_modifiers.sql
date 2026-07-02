-- POS modifiers: option groups (size / add-ons), options, per-line snapshots, plus cart line notes/size/discount.
begin;

create table if not exists public.pos_modifier_groups (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(120) not null,
  scope varchar(20) not null default 'item'
    check (scope in ('item', 'category')),
  item_id bigint references public.inv_items(id) on delete cascade,
  category_id bigint references public.inv_item_categories(id) on delete cascade,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 0),
  required boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_modifier_groups_item
  on public.pos_modifier_groups (tenant_id, item_id) where item_id is not null;
create index if not exists idx_pos_modifier_groups_category
  on public.pos_modifier_groups (tenant_id, category_id) where category_id is not null;

create table if not exists public.pos_modifiers (
  id bigserial primary key,
  group_id bigint not null references public.pos_modifier_groups(id) on delete cascade,
  name varchar(120) not null,
  price_delta numeric(18,4) not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_modifiers_group
  on public.pos_modifiers (group_id, sort_order);

create table if not exists public.pos_cart_line_modifiers (
  id bigserial primary key,
  line_id bigint not null references public.pos_cart_lines(id) on delete cascade,
  modifier_id bigint references public.pos_modifiers(id) on delete set null,
  name varchar(120) not null,
  price_delta numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_cart_line_modifiers_line
  on public.pos_cart_line_modifiers (line_id);

alter table public.pos_cart_lines
  add column if not exists notes text,
  add column if not exists size_label varchar(60),
  add column if not exists discount_amount numeric(18,4) not null default 0 check (discount_amount >= 0);

commit;
