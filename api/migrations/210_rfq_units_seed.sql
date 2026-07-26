-- Units of measure commonly found on Philippine government / supplier RFQs
-- (BATELEC office-supply forms, PhilGEPS annexes). Smart RFQ normalizes scraped
-- unit text to these codes; seeding them lets resolveRfqLineUnit bind a real UoM
-- instead of falling back to a remark.
begin;

insert into public.inv_units (tenant_id, code, name)
select t.id, u.code, u.name
from public.tenants t
cross join (
  values
    ('roll', 'Roll'),
    ('bottle', 'Bottle'),
    ('pack', 'Pack'),
    ('ream', 'Ream'),
    ('unit', 'Unit'),
    ('lot', 'Lot'),
    ('pair', 'Pair'),
    ('dozen', 'Dozen'),
    ('tube', 'Tube'),
    ('can', 'Can'),
    ('gal', 'Gallon'),
    ('carton', 'Carton'),
    ('bundle', 'Bundle')
) as u(code, name)
where t.status = 'active'
on conflict (tenant_id, code) do nothing;

commit;
