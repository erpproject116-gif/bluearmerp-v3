-- Booking module: resources, services, bookings, convert-to-quotation.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('booking', 'Booking', 'module', false, true, 95)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    sort_order = excluded.sort_order,
    tenant_enableable = excluded.tenant_enableable;

insert into public.tenant_modules (tenant_id, module_code, is_enabled)
select t.id, 'booking', true
from public.tenants t
on conflict (tenant_id, module_code) do nothing;

create table if not exists public.book_resources (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(255) not null,
  resource_type text not null default 'staff'
    check (resource_type in ('staff', 'room', 'vehicle', 'other')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_book_resources_tenant
  on public.book_resources (tenant_id, is_active);

create table if not exists public.book_services (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(255) not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  item_id bigint references public.inv_items(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_book_services_tenant
  on public.book_services (tenant_id, is_active);

create table if not exists public.book_bookings (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  booking_no varchar(40) not null,
  booking_date date not null default current_date,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  partner_id bigint references public.inv_partners(id) on delete set null,
  resource_id bigint references public.book_resources(id) on delete set null,
  service_id bigint references public.book_services(id) on delete set null,
  title varchar(255) not null,
  notes text,
  location_id bigint references public.inv_locations(id) on delete set null,
  quotation_id bigint references public.quo_quotations(id) on delete set null,
  created_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, booking_no),
  check (ends_at > starts_at)
);

create index if not exists idx_book_bookings_tenant_starts
  on public.book_bookings (tenant_id, starts_at);
create index if not exists idx_book_bookings_status
  on public.book_bookings (tenant_id, status);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('booking.bookings', 'booking', 'bookings', 'Bookings', 10),
  ('booking.bookings_new', 'booking', 'bookings_new', 'Create bookings', 11),
  ('booking.resources', 'booking', 'resources', 'Booking resources', 20),
  ('booking.services', 'booking', 'services', 'Booking services', 30)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, r.role_code, pr.permission_code, 'write'
from public.tenants t
cross join (values ('store_admin'), ('owner'), ('superadmin')) as r(role_code)
cross join public.permission_registry pr
where pr.module_code = 'booking'
on conflict (tenant_id, role_code, permission_code) do update
set access_level = excluded.access_level;

commit;
