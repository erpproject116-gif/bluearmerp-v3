-- Recipe BOM auto codes (Rmmddyyyy-######), same sequence table as assembly.
begin;

create or replace function public.allocate_mfg_bom_code(
  p_tenant_id bigint,
  p_date date,
  p_prefix text
) returns text
language plpgsql
as $$
declare
  v_seq int;
  v_prefix text := upper(coalesce(nullif(trim(p_prefix), ''), 'A'));
begin
  insert into public.mfg_bom_code_sequences (tenant_id, seq_date, last_seq)
  values (p_tenant_id, p_date, 1)
  on conflict (tenant_id, seq_date)
  do update set last_seq = mfg_bom_code_sequences.last_seq + 1
  returning last_seq into v_seq;

  return v_prefix || to_char(p_date, 'MMDDYYYY') || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

create or replace function public.allocate_mfg_assembly_bom_code(
  p_tenant_id bigint,
  p_date date
) returns text
language plpgsql
as $$
begin
  return public.allocate_mfg_bom_code(p_tenant_id, p_date, 'A');
end;
$$;

create or replace function public.allocate_mfg_recipe_bom_code(
  p_tenant_id bigint,
  p_date date
) returns text
language plpgsql
as $$
begin
  return public.allocate_mfg_bom_code(p_tenant_id, p_date, 'R');
end;
$$;

commit;
