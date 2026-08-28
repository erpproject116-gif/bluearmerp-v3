-- Production QC process policy (opt-in: new WOs default inspection pending).
begin;

alter table public.tenant_process_policies
  add column if not exists manufacturing_require_fg_qc boolean not null default false;

comment on column public.tenant_process_policies.manufacturing_require_fg_qc is
  'When true, new work orders start with inspection_status=pending until QC releases FG.';

commit;
