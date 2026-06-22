-- Verify demo inventory seed counts per tenant (expected: partners 120, locations 88, projects 87, departments 88, items 150)
select t.company_code, 'partners' as entity, count(*)::bigint as row_count
from public.inv_partners p
join public.tenants t on t.id = p.tenant_id
where t.company_code in ('DEMO000', 'BLUEARM') and p.deleted_at is null
group by t.company_code
union all
select t.company_code, 'locations', count(*)::bigint
from public.inv_locations l
join public.tenants t on t.id = l.tenant_id
where t.company_code in ('DEMO000', 'BLUEARM') and l.deleted_at is null
group by t.company_code
union all
select t.company_code, 'projects', count(*)::bigint
from public.inv_projects p
join public.tenants t on t.id = p.tenant_id
where t.company_code in ('DEMO000', 'BLUEARM') and p.deleted_at is null
group by t.company_code
union all
select t.company_code, 'departments', count(*)::bigint
from public.inv_departments d
join public.tenants t on t.id = d.tenant_id
where t.company_code in ('DEMO000', 'BLUEARM') and d.deleted_at is null
group by t.company_code
union all
select t.company_code, 'items', count(*)::bigint
from public.inv_items i
join public.tenants t on t.id = i.tenant_id
where t.company_code in ('DEMO000', 'BLUEARM') and i.deleted_at is null
group by t.company_code
order by company_code, entity;
