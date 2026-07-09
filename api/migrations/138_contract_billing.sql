-- Contract milestone recurring billing (Phase 2B)
begin;

alter table public.fin_contracts
  add column if not exists inv_project_id bigint references public.inv_projects(id) on delete set null,
  add column if not exists job_cost_project_id bigint references public.job_cost_projects(id) on delete set null;

alter table public.fin_contract_milestones
  add column if not exists updated_at timestamptz not null default now();

alter table public.fin_contract_milestones
  drop constraint if exists fin_contract_milestones_status_check;

alter table public.fin_contract_milestones
  add constraint fin_contract_milestones_status_check
  check (status in ('pending', 'billed', 'collected'));

alter table public.sa_sales
  add column if not exists source_contract_milestone_id bigint references public.fin_contract_milestones(id) on delete set null;

create unique index if not exists idx_sa_sales_contract_milestone
  on public.sa_sales (source_contract_milestone_id)
  where source_contract_milestone_id is not null and deleted_at is null;

alter table public.tenant_process_policies
  add column if not exists contract_billing_auto_post boolean not null default false,
  add column if not exists contract_billing_service_item_id bigint references public.inv_items(id) on delete set null;

create index if not exists idx_fin_contract_milestones_billing_due
  on public.fin_contract_milestones (due_date)
  where status = 'pending' and billed_sale_id is null;

commit;
