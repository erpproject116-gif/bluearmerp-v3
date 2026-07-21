-- Length (and related) units + conversions for manufacturing/inventory UoM.
begin;

insert into public.inv_units (tenant_id, code, name)
select t.id, u.code, u.name
from public.tenants t
cross join (
  values
    ('mm', 'Millimeter'),
    ('km', 'Kilometer'),
    ('in', 'Inch'),
    ('ft', 'Foot'),
    ('yd', 'Yard'),
    ('mi', 'Mile')
) as u(code, name)
where t.status = 'active'
on conflict (tenant_id, code) do nothing;

-- Length conversions (factor = how many `to` per 1 `from`). Inverse used at runtime.
insert into public.inv_unit_conversions (tenant_id, from_unit_id, to_unit_id, factor)
select t.id, f.id, g.id, v.factor
from public.tenants t
cross join (
  values
    ('m', 'mm', 1000::numeric),
    ('m', 'cm', 100::numeric),
    ('km', 'm', 1000::numeric),
    ('ft', 'in', 12::numeric),
    ('yd', 'ft', 3::numeric),
    ('mi', 'yd', 1760::numeric),
    ('in', 'cm', 2.54::numeric),
    ('ft', 'm', 0.3048::numeric),
    ('yd', 'm', 0.9144::numeric)
) as v(from_code, to_code, factor)
join public.inv_units f on f.tenant_id = t.id and lower(f.code) = lower(v.from_code)
join public.inv_units g on g.tenant_id = t.id and lower(g.code) = lower(v.to_code)
where t.status = 'active'
on conflict (tenant_id, from_unit_id, to_unit_id) do nothing;

commit;
