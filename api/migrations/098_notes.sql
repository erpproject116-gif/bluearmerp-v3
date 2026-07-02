-- Notes receivable / payable
begin;

create table if not exists public.fin_notes (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  note_type text not null check (note_type in ('receivable', 'payable')),
  note_no text not null,
  partner_id bigint not null references public.inv_partners(id),
  issue_date date not null,
  due_date date not null,
  amount numeric(18,4) not null default 0,
  status text not null default 'open',
  ref_type text,
  ref_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, note_type, note_no)
);

commit;
