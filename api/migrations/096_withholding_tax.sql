-- Withholding tax
begin;

create table if not exists public.fin_withholding_tax_codes (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  code text not null,
  description text not null,
  rate_pct numeric(8,4) not null default 0,
  active boolean not null default true,
  unique (tenant_id, code)
);

create table if not exists public.fin_withholding_tax_lines (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  ref_type text not null,
  ref_id bigint not null,
  tax_code_id bigint not null references public.fin_withholding_tax_codes(id),
  base_amount numeric(18,4) not null default 0,
  tax_amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);

insert into public.permission_registry (permission_code, module_code, feature_key, label, sort_order) values
  ('finance.withholding_read', 'finance', 'withholding_read', 'Withholding tax (read)', 82),
  ('finance.withholding_write', 'finance', 'withholding_write', 'Withholding tax (write)', 83)
on conflict (permission_code) do nothing;

commit;
