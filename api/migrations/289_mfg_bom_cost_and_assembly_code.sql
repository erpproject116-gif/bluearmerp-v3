-- Assembly BOM cost estimates + auto-generated assembly recipe codes (Ammddyyyy-######).
begin;

alter table public.mfg_boms
  add column if not exists additional_cost_type varchar(50),
  add column if not exists direct_labor_cost numeric(18,4) not null default 0,
  add column if not exists inbound_freight_cost numeric(18,4) not null default 0;

alter table public.mfg_boms
  drop constraint if exists mfg_boms_direct_labor_cost_nonneg;
alter table public.mfg_boms
  add constraint mfg_boms_direct_labor_cost_nonneg check (direct_labor_cost >= 0);

alter table public.mfg_boms
  drop constraint if exists mfg_boms_inbound_freight_cost_nonneg;
alter table public.mfg_boms
  add constraint mfg_boms_inbound_freight_cost_nonneg check (inbound_freight_cost >= 0);

create table if not exists public.mfg_bom_code_sequences (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  seq_date date not null,
  last_seq integer not null default 0,
  primary key (tenant_id, seq_date)
);

create or replace function public.allocate_mfg_assembly_bom_code(
  p_tenant_id bigint,
  p_date date
) returns text
language plpgsql
as $$
declare
  v_seq int;
begin
  insert into public.mfg_bom_code_sequences (tenant_id, seq_date, last_seq)
  values (p_tenant_id, p_date, 1)
  on conflict (tenant_id, seq_date)
  do update set last_seq = mfg_bom_code_sequences.last_seq + 1
  returning last_seq into v_seq;

  return 'A' || to_char(p_date, 'MMDDYYYY') || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

commit;
