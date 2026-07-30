-- Phase S1: BIR statutory — 2307 period certificates, statutory permissions
begin;

create table if not exists public.fin_bir_2307_certificates (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  payee_partner_id bigint not null references public.inv_partners(id),
  period_from date not null,
  period_to date not null,
  certificate_no text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  total_base numeric(18,4) not null default 0,
  total_tax numeric(18,4) not null default 0,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  voided_at timestamptz,
  created_by_user_id bigint references public.users(id),
  unique (tenant_id, certificate_no)
);

create index if not exists idx_fin_bir_2307_certificates_list
  on public.fin_bir_2307_certificates (tenant_id, period_from desc, payee_partner_id);

create table if not exists public.fin_bir_2307_certificate_lines (
  id bigserial primary key,
  certificate_id bigint not null references public.fin_bir_2307_certificates(id) on delete cascade,
  withholding_line_id bigint references public.fin_withholding_tax_lines(id),
  atc_code text not null,
  description text not null,
  rate_pct numeric(8,4) not null default 0,
  base_amount numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  source_ref_type text,
  source_ref_id bigint,
  source_date date
);

create index if not exists idx_fin_bir_2307_certificate_lines_cert
  on public.fin_bir_2307_certificate_lines (certificate_id);

create index if not exists idx_fin_bir_2307_certificate_lines_wht
  on public.fin_bir_2307_certificate_lines (withholding_line_id)
  where withholding_line_id is not null;

create index if not exists idx_fin_withholding_tax_lines_ref
  on public.fin_withholding_tax_lines (tenant_id, ref_type, ref_id);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.statutory_read', 'finance', 'statutory_read', 'BIR statutory (read)', 84),
  ('finance.statutory_write', 'finance', 'statutory_write', 'BIR statutory (write)', 85)
on conflict (permission_code) do nothing;

commit;
