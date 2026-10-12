-- Employee profile columns. National ID is stored for the form and is not a default list column.
alter table public.hr_employees
  add column if not exists birthdate date,
  add column if not exists national_id varchar(40),
  add column if not exists emergency_contact_name varchar(160),
  add column if not exists emergency_contact_address text,
  add column if not exists emergency_contact_phone varchar(40);
