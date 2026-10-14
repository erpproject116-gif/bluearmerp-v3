-- One row per tenant after unfinished sales and purchase invoice journals
-- have been reversed. The repair does not run again for that tenant.
create table if not exists public.fin_unfinished_journal_repairs (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  repaired_at timestamptz not null default now()
);
