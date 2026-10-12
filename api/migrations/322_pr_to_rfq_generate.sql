-- Let Generate slip turn a purchase request into an RFQ.
begin;

insert into public.doc_generation_rules (tenant_id, name, source_entity, target_entity, field_map, summarize_by, require_confirmed_source)
select t.id, 'Default PR to RFQ', 'purchase_request', 'rfq', '{}'::jsonb, array['partner_id']::text[], false
from public.tenants t
on conflict do nothing;

commit;
