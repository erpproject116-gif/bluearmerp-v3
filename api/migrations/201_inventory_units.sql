-- Inventory units master + item base unit + conversions.
begin;

create table if not exists public.inv_units (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(30) not null,
  name varchar(100) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create unique index if not exists idx_inv_units_tenant_code_lower
  on public.inv_units (tenant_id, lower(code));

create index if not exists idx_inv_units_tenant_active
  on public.inv_units (tenant_id, is_active);

create table if not exists public.inv_unit_conversions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  from_unit_id bigint not null references public.inv_units(id) on delete cascade,
  to_unit_id bigint not null references public.inv_units(id) on delete cascade,
  factor numeric(18,8) not null check (factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, from_unit_id, to_unit_id),
  check (from_unit_id <> to_unit_id)
);

create index if not exists idx_inv_unit_conversions_tenant
  on public.inv_unit_conversions (tenant_id);

alter table public.inv_items
  add column if not exists base_unit_id bigint references public.inv_units(id);

create index if not exists idx_inv_items_base_unit
  on public.inv_items (tenant_id, base_unit_id)
  where base_unit_id is not null;

-- Seed common units for every active tenant.
insert into public.inv_units (tenant_id, code, name)
select t.id, u.code, u.name
from public.tenants t
cross join (
  values
    ('ea', 'Each'),
    ('pc', 'Piece'),
    ('box', 'Box'),
    ('kg', 'Kilogram'),
    ('g', 'Gram'),
    ('mm', 'Millimeter'),
    ('cm', 'Centimeter'),
    ('m', 'Meter'),
    ('km', 'Kilometer'),
    ('in', 'Inch'),
    ('ft', 'Foot'),
    ('yd', 'Yard'),
    ('L', 'Liter'),
    ('sheet', 'Sheet'),
    ('set', 'Set')
) as u(code, name)
where t.status = 'active'
on conflict (tenant_id, code) do nothing;

-- Backfill base_unit_id from free-text unit (match/create per tenant).
do $$
declare
  r record;
  v_code text;
  v_unit_id bigint;
begin
  for r in
    select i.id as item_id, i.tenant_id, nullif(trim(i.unit), '') as unit_text
    from public.inv_items i
    where i.base_unit_id is null
      and i.deleted_at is null
  loop
    v_code := lower(coalesce(r.unit_text, 'ea'));
    if length(v_code) > 30 then
      v_code := left(v_code, 30);
    end if;
    if v_code = '' then
      v_code := 'ea';
    end if;

    select u.id into v_unit_id
    from public.inv_units u
    where u.tenant_id = r.tenant_id and lower(u.code) = v_code
    limit 1;

    if v_unit_id is null then
      insert into public.inv_units (tenant_id, code, name)
      values (r.tenant_id, v_code, coalesce(nullif(r.unit_text, ''), initcap(v_code)))
      on conflict (tenant_id, code) do update set updated_at = now()
      returning id into v_unit_id;
    end if;

    if v_unit_id is null then
      select u.id into v_unit_id
      from public.inv_units u
      where u.tenant_id = r.tenant_id and lower(u.code) = v_code
      limit 1;
    end if;

    update public.inv_items set base_unit_id = v_unit_id where id = r.item_id;
  end loop;
end $$;

-- Default remaining items to ea.
update public.inv_items i
set base_unit_id = u.id
from public.inv_units u
where i.base_unit_id is null
  and u.tenant_id = i.tenant_id
  and lower(u.code) = 'ea';

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order)
values ('inventory.units', 'inventory', 'units', 'Units of measure', 55)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', 'inventory.units', 'write'
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

-- Extra unit used by volume conversion.
insert into public.inv_units (tenant_id, code, name)
select t.id, 'ml', 'Milliliter'
from public.tenants t
where t.status = 'active'
on conflict (tenant_id, code) do nothing;

-- Seed common conversions (factor = how many `to` per 1 `from`). Inverse used at runtime.
insert into public.inv_unit_conversions (tenant_id, from_unit_id, to_unit_id, factor)
select t.id, f.id, g.id, v.factor
from public.tenants t
cross join (
  values
    ('kg', 'g', 1000::numeric),
    ('m', 'cm', 100::numeric),
    ('L', 'ml', 1000::numeric)
) as v(from_code, to_code, factor)
join public.inv_units f on f.tenant_id = t.id and lower(f.code) = lower(v.from_code)
join public.inv_units g on g.tenant_id = t.id and lower(g.code) = lower(v.to_code)
where t.status = 'active'
on conflict (tenant_id, from_unit_id, to_unit_id) do nothing;

commit;
