-- Store HR employee document bytes in DB (durable on ephemeral deploys)
-- and allow 201_form as a document type for the 201 file.

alter table public.hr_employee_documents
  add column if not exists file_bytes bytea;

alter table public.hr_employee_documents
  drop constraint if exists hr_employee_documents_doc_type_check;

alter table public.hr_employee_documents
  add constraint hr_employee_documents_doc_type_check
  check (doc_type in (
    'resume', 'contract', 'id_gov', 'id_sss', 'id_philhealth', 'id_pagibig', 'id_tin',
    'nbi', 'medical', 'certificate', 'clearance', 'photo', 'other', '201_form'
  ));
