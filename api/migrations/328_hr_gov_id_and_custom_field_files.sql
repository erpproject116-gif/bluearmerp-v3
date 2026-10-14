-- Optional government ID scans on the employee 201 file, and stored files for custom fields.

begin;

do $$
declare cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'tenant_custom_field_definitions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%field_type%'
  loop
    execute format('alter table public.tenant_custom_field_definitions drop constraint %I', cname);
  end loop;
end $$;

alter table public.tenant_custom_field_definitions
  add constraint tenant_custom_field_definitions_field_type_check
  check (field_type in (
    'text', 'textarea', 'number', 'select', 'radio', 'checkbox',
    'date', 'date_range', 'number_range', 'file'
  ));


alter table public.hr_employee_documents drop constraint if exists hr_employee_documents_doc_type_check;
alter table public.hr_employee_documents
  add constraint hr_employee_documents_doc_type_check
  check (doc_type in (
    'resume', 'contract', 'id_gov', 'id_sss', 'id_philhealth', 'id_pagibig', 'id_tin',
    'id_national', 'id_umid', 'id_drivers_license', 'id_passport', 'id_prc', 'id_voter',
    'id_postal', 'id_senior', 'id_pwd', 'id_barangay',
    'nbi', 'medical', 'certificate', 'clearance', 'photo', '201_form',
    'nte', 'warning', 'da', 'onboarding', 'review', 'other'
  ));

create table if not exists public.tenant_custom_field_files (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  field_key text not null,
  file_name text not null,
  mime_type text not null default '',
  file_bytes bytea not null,
  uploaded_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_custom_field_files_entity
  on public.tenant_custom_field_files (tenant_id, entity_type, entity_id, field_key);

commit;
