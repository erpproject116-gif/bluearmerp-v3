-- Verify demo quotation seed counts for DEMO000
select 'quo_quotations' as entity, count(*)::bigint as total
from public.quo_quotations q
join public.tenants t on t.id = q.tenant_id
where t.company_code = 'DEMO000' and q.deleted_at is null
union all
select 'quo_quotation_lines', count(*)::bigint
from public.quo_quotation_lines ln
join public.quo_quotations q on q.id = ln.quotation_id
join public.tenants t on t.id = q.tenant_id
where t.company_code = 'DEMO000' and q.deleted_at is null
union all
select 'quo_tax_types (active)', count(*)::bigint
from public.quo_tax_types tt
join public.tenants t on t.id = tt.tenant_id
where t.company_code = 'DEMO000' and tt.deleted_at is null and tt.status = 'active';

select q.reference_no, q.progress_status, p.company_name, q.grand_total::text
from public.quo_quotations q
join public.tenants t on t.id = q.tenant_id
join public.inv_partners p on p.id = q.partner_id
where t.company_code = 'DEMO000' and q.deleted_at is null
order by q.order_date desc, q.date_seq desc;
