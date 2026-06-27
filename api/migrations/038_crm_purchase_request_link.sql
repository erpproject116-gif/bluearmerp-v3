-- CRM follow-up tasks: link to purchase requests
begin;

alter table public.crm_follow_up_tasks
  add column if not exists purchase_request_id bigint references public.pr_purchase_requests(id) on delete set null;

create index if not exists idx_crm_follow_up_tasks_pr
  on public.crm_follow_up_tasks (tenant_id, purchase_request_id)
  where purchase_request_id is not null;

create unique index if not exists idx_crm_tasks_open_purchase_request
  on public.crm_follow_up_tasks (tenant_id, purchase_request_id)
  where purchase_request_id is not null
    and stage not in ('completed', 'cancelled', 'closed');

commit;
