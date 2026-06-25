-- CRM follow-up tasks: workflow stages, open-task dedupe per linked document.
begin;

alter table public.crm_follow_up_tasks
  drop constraint if exists crm_follow_up_tasks_stage_check;

alter table public.crm_follow_up_tasks
  add constraint crm_follow_up_tasks_stage_check check (stage in (
    'scheduled', 'due_soon', 'overdue', 'follow_up', 'forwarded_sales',
    'completed', 'cancelled', 'closed'
  ));

-- Existing data may have multiple open tasks per linked record (pre-dedupe).
-- Keep the most recently updated task; cancel older duplicates.
with ranked_quotation as (
  select t.id,
    row_number() over (
      partition by t.tenant_id, t.quotation_id
      order by t.updated_at desc, t.id desc
    ) as rn
  from public.crm_follow_up_tasks t
  where t.quotation_id is not null
    and t.stage not in ('completed', 'cancelled', 'closed')
)
update public.crm_follow_up_tasks t
set stage = 'cancelled', updated_at = now()
from ranked_quotation r
where t.id = r.id and r.rn > 1;

with ranked_sales as (
  select t.id,
    row_number() over (
      partition by t.tenant_id, t.sales_id
      order by t.updated_at desc, t.id desc
    ) as rn
  from public.crm_follow_up_tasks t
  where t.sales_id is not null
    and t.stage not in ('completed', 'cancelled', 'closed')
)
update public.crm_follow_up_tasks t
set stage = 'cancelled', updated_at = now()
from ranked_sales r
where t.id = r.id and r.rn > 1;

with ranked_warranty as (
  select t.id,
    row_number() over (
      partition by t.tenant_id, t.warranty_asset_id
      order by t.updated_at desc, t.id desc
    ) as rn
  from public.crm_follow_up_tasks t
  where t.warranty_asset_id is not null
    and t.stage not in ('completed', 'cancelled', 'closed')
)
update public.crm_follow_up_tasks t
set stage = 'cancelled', updated_at = now()
from ranked_warranty r
where t.id = r.id and r.rn > 1;

create unique index if not exists idx_crm_tasks_open_quotation
  on public.crm_follow_up_tasks (tenant_id, quotation_id)
  where quotation_id is not null
    and stage not in ('completed', 'cancelled', 'closed');

create unique index if not exists idx_crm_tasks_open_sales
  on public.crm_follow_up_tasks (tenant_id, sales_id)
  where sales_id is not null
    and stage not in ('completed', 'cancelled', 'closed');

create unique index if not exists idx_crm_tasks_open_warranty
  on public.crm_follow_up_tasks (tenant_id, warranty_asset_id)
  where warranty_asset_id is not null
    and stage not in ('completed', 'cancelled', 'closed');

commit;
