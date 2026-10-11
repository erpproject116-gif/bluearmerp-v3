-- Services module. New svc_* tables only.
-- No columns are added to sales, inventory, finance, CRM, booking, or manufacturing tables.
-- No tenant_modules rows: the module stays off until a tenant turns it on.
begin;

insert into public.module_registry (module_code, module_name, module_type, is_core, tenant_enableable, sort_order)
values ('services', 'Services', 'module', false, true, 46)
on conflict (module_code) do update
set module_name = excluded.module_name,
    module_type = excluded.module_type,
    tenant_enableable = excluded.tenant_enableable,
    sort_order = excluded.sort_order;

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('services.requests', 'services', 'requests', 'Service requests', 10),
  ('services.jobs', 'services', 'jobs', 'Service job orders', 20),
  ('services.jobs_confirm', 'services', 'jobs_confirm', 'Confirm service jobs', 30),
  ('services.jobs_reopen', 'services', 'jobs_reopen', 'Reopen service jobs', 40),
  ('services.equipment', 'services', 'equipment', 'Customer equipment', 50),
  ('services.equipment_correct', 'services', 'equipment_correct', 'Correct equipment ownership', 60),
  ('services.schedule', 'services', 'schedule', 'Technician schedule', 70),
  ('services.releases', 'services', 'releases', 'Service release slips', 80),
  ('services.releases_approve', 'services', 'releases_approve', 'Approve service release slips', 90),
  ('services.reports', 'services', 'reports', 'Service reports', 100),
  ('services.settings', 'services', 'settings', 'Service settings', 110)
on conflict (permission_code) do nothing;

insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
select t.id, 'store_admin', pr.permission_code, 'write'
from public.tenants t
join public.tenant_roles tr on tr.tenant_id = t.id and tr.role_code = 'store_admin'
cross join public.permission_registry pr
where pr.module_code = 'services'
on conflict (tenant_id, role_code, permission_code) do nothing;

create table if not exists public.svc_settings (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  integration_mode text not null default 'A' check (integration_mode = 'A'),
  number_prefix varchar(12) not null default 'SJO',
  seeded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_service_types (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code varchar(40) not null,
  name varchar(200) not null,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.svc_status_transitions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  unique (tenant_id, from_status, to_status)
);

create table if not exists public.svc_checklist_templates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  name varchar(200) not null,
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  location_id bigint not null references public.inv_locations(id),
  partner_id bigint references public.inv_partners(id),
  service_type_id bigint not null references public.svc_service_types(id),
  request_no varchar(40) not null,
  order_date date not null,
  date_seq int not null,
  source text not null default 'manual'
    check (source in ('walk_in', 'phone', 'email', 'portal', 'manual')),
  subject varchar(500) not null default '',
  description text not null default '',
  priority text not null default 'normal',
  contact_name varchar(255) not null default '',
  phone varchar(80) not null default '',
  email varchar(255) not null default '',
  requested_on date,
  service_location text not null default '',
  status text not null default 'new'
    check (status in ('new', 'under_review', 'accepted', 'converted', 'rejected', 'cancelled', 'duplicate', 'waiting_for_customer')),
  coordinator_employee_id bigint references public.hr_employees(id),
  deleted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_no)
);

create index if not exists idx_svc_requests_list
  on public.svc_requests (tenant_id, order_date desc)
  where deleted_at is null;

create table if not exists public.svc_jobs (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  location_id bigint not null references public.inv_locations(id),
  service_type_id bigint not null references public.svc_service_types(id),
  type_config_snapshot jsonb not null,
  request_id bigint references public.svc_requests(id),
  sales_order_id bigint,
  quotation_id bigint,
  partner_id bigint references public.inv_partners(id),
  job_no varchar(40) not null,
  order_date date not null,
  date_seq int not null,
  subject varchar(500) not null default '',
  description text not null default '',
  diagnosis text not null default '',
  priority text not null default 'normal',
  operational_status text not null default 'draft'
    check (operational_status in (
      'draft', 'open', 'scheduled', 'in_progress', 'on_hold', 'pending_qc', 'completed', 'closed', 'cancelled'
    )),
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  inventory_posting_status text not null default 'not_applicable'
    check (inventory_posting_status = 'not_applicable'),
  billing_status text not null default 'not_applicable'
    check (billing_status in ('not_applicable', 'not_ready')),
  qc_passed boolean not null default false,
  customer_approved boolean not null default false,
  due_at timestamptz,
  coordinator_employee_id bigint references public.hr_employees(id),
  row_version int not null default 1,
  deleted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_no)
);

create unique index if not exists uq_svc_jobs_request
  on public.svc_jobs (tenant_id, request_id)
  where request_id is not null and deleted_at is null;

create unique index if not exists uq_svc_jobs_sales_order
  on public.svc_jobs (tenant_id, sales_order_id)
  where sales_order_id is not null and deleted_at is null;

create index if not exists idx_svc_jobs_list
  on public.svc_jobs (tenant_id, order_date desc)
  where deleted_at is null;

create table if not exists public.svc_tasks (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  name varchar(200) not null,
  description text not null default '',
  employee_id bigint references public.hr_employees(id),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  status text not null default 'open',
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_assignments (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_svc_assignments_employee
  on public.svc_assignments (tenant_id, employee_id, scheduled_start);

create table if not exists public.svc_time_entries (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  employee_id bigint not null references public.hr_employees(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes int not null default 0 check (minutes >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.svc_checklist_results (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  template_id bigint references public.svc_checklist_templates(id),
  item_key varchar(80) not null,
  label varchar(200) not null,
  is_done boolean not null default false,
  remarks text not null default '',
  unique (job_id, item_key)
);

create table if not exists public.svc_customer_equipment (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  partner_id bigint not null references public.inv_partners(id),
  location_id bigint not null references public.inv_locations(id),
  name varchar(200) not null,
  category varchar(120) not null default '',
  brand varchar(120) not null default '',
  model varchar(120) not null default '',
  serial_no varchar(255) not null default '',
  asset_tag varchar(120) not null default '',
  is_serialized boolean not null default false,
  qty numeric(18,4) not null default 1 check (qty > 0),
  qty_in_custody numeric(18,4) not null default 0 check (qty_in_custody >= 0),
  description text not null default '',
  condition text not null default '',
  accessories text not null default '',
  warranty_note text not null default '',
  custody_status text not null default 'with_customer'
    check (custody_status in (
      'with_customer', 'received', 'in_service', 'with_technician', 'in_transit',
      'ready_for_pickup', 'released', 'returned', 'lost_damaged'
    )),
  row_version int not null default 1,
  deleted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_svc_equipment_active_serial
  on public.svc_customer_equipment (tenant_id, partner_id, serial_no)
  where deleted_at is null and is_serialized = true and serial_no <> '';

create index if not exists idx_svc_equipment_list
  on public.svc_customer_equipment (tenant_id, name)
  where deleted_at is null;

create table if not exists public.svc_job_equipment (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  equipment_id bigint not null references public.svc_customer_equipment(id),
  unique (job_id, equipment_id)
);

create table if not exists public.svc_custody_movements (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  equipment_id bigint not null references public.svc_customer_equipment(id),
  slip_id bigint,
  movement_type text not null,
  from_location_id bigint,
  to_location_id bigint,
  from_custodian text not null default '',
  to_custodian text not null default '',
  qty numeric(18,4) not null check (qty > 0),
  related_doc text not null default '',
  remarks text not null default '',
  authorized_by_user_id bigint references public.users(id),
  moved_at timestamptz not null default now()
);

create index if not exists idx_svc_custody_equipment
  on public.svc_custody_movements (tenant_id, equipment_id, moved_at desc);

create table if not exists public.svc_materials (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint not null references public.svc_jobs(id) on delete cascade,
  item_code varchar(40) not null default '',
  description text not null default '',
  required_qty numeric(18,4) not null default 0,
  used_qty numeric(18,4) not null default 0,
  returned_qty numeric(18,4) not null default 0,
  posting_status text not null default 'not_posted' check (posting_status = 'not_posted'),
  created_at timestamptz not null default now()
);

create table if not exists public.svc_load_slips (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint references public.svc_jobs(id),
  slip_no varchar(40) not null,
  order_date date not null,
  date_seq int not null,
  slip_type text not null check (slip_type in ('receiving', 'internal_transfer', 'outbound', 'release')),
  status text not null default 'draft'
    check (status in ('draft', 'for_approval', 'approved', 'in_transit', 'received', 'released', 'closed', 'cancelled')),
  origin_location_id bigint not null references public.inv_locations(id),
  destination_location_id bigint references public.inv_locations(id),
  partner_id bigint references public.inv_partners(id),
  method text not null default '',
  driver_name text not null default '',
  remarks text not null default '',
  recipient_name text not null default '',
  row_version int not null default 1,
  deleted_at timestamptz,
  created_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slip_no)
);

create index if not exists idx_svc_load_slips_list
  on public.svc_load_slips (tenant_id, order_date desc)
  where deleted_at is null;

create table if not exists public.svc_load_slip_items (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  slip_id bigint not null references public.svc_load_slips(id) on delete cascade,
  equipment_id bigint not null references public.svc_customer_equipment(id),
  serial_no varchar(255) not null default '',
  is_serialized boolean not null default false,
  qty numeric(18,4) not null,
  condition text not null default '',
  constraint svc_slip_item_qty_positive check (qty > 0),
  constraint svc_slip_serial_not_fractional check (is_serialized = false or qty = 1)
);

alter table public.svc_custody_movements
  drop constraint if exists svc_custody_movements_slip_fk;
alter table public.svc_custody_movements
  add constraint svc_custody_movements_slip_fk
  foreign key (slip_id) references public.svc_load_slips(id);

create table if not exists public.svc_document_links (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  job_id bigint references public.svc_jobs(id) on delete cascade,
  doc_type text not null,
  doc_id bigint not null,
  idempotency_key varchar(160) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.svc_status_events (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  action text not null,
  from_status text not null default '',
  to_status text not null default '',
  actor_user_id bigint references public.users(id),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_svc_status_events_entity
  on public.svc_status_events (tenant_id, entity_type, entity_id, created_at desc);

create or replace function public.allocate_svc_request_sequences(p_tenant_id bigint, p_order_date date)
returns table(date_seq int, doc_no varchar(40))
language plpgsql
as $$
declare
  v_date_seq int;
  v_no_seq int;
  v_prefix text;
begin
  insert into public.svc_settings (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  select number_prefix into v_prefix from public.svc_settings where tenant_id = p_tenant_id;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_request_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_request_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_no_seq;
  return query select v_date_seq, (v_prefix || '-SR-' || to_char(p_order_date, 'YYMMDD') || lpad(v_no_seq::text, 4, '0'))::varchar(40);
end;
$$;

create or replace function public.allocate_svc_job_sequences(p_tenant_id bigint, p_order_date date)
returns table(date_seq int, doc_no varchar(40))
language plpgsql
as $$
declare
  v_date_seq int;
  v_no_seq int;
  v_prefix text;
begin
  insert into public.svc_settings (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  select number_prefix into v_prefix from public.svc_settings where tenant_id = p_tenant_id;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_job_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_job_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_no_seq;
  return query select v_date_seq, (v_prefix || '-' || to_char(p_order_date, 'YYMMDD') || lpad(v_no_seq::text, 4, '0'))::varchar(40);
end;
$$;

create or replace function public.allocate_svc_load_slip_sequences(p_tenant_id bigint, p_order_date date)
returns table(date_seq int, doc_no varchar(40))
language plpgsql
as $$
declare
  v_date_seq int;
  v_no_seq int;
  v_prefix text;
begin
  insert into public.svc_settings (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  select number_prefix into v_prefix from public.svc_settings where tenant_id = p_tenant_id;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_slip_date_seq', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_date_seq;
  insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
  values (p_tenant_id, 'svc_slip_no', p_order_date, 1)
  on conflict (tenant_id, sequence_key, bucket_date)
  do update set last_value = tenant_daily_sequences.last_value + 1
  returning last_value into v_no_seq;
  return query select v_date_seq, (v_prefix || '-LS-' || to_char(p_order_date, 'YYMMDD') || lpad(v_no_seq::text, 4, '0'))::varchar(40);
end;
$$;

commit;
