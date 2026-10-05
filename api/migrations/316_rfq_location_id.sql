-- RFQ branch scope: location_id for Active-branch / user datascope filtering.
begin;

alter table public.rfq_requests
  add column if not exists location_id bigint references public.inv_locations(id) on delete set null;

create index if not exists idx_rfq_requests_tenant_location
  on public.rfq_requests (tenant_id, location_id)
  where location_id is not null;

-- Backfill from linked purchase request when present.
update public.rfq_requests r
set location_id = pr.location_id
from public.pr_purchase_requests pr
where r.purchase_request_id = pr.id
  and r.tenant_id = pr.tenant_id
  and r.location_id is null
  and pr.location_id is not null;

commit;
