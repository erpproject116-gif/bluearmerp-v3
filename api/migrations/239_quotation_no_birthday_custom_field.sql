-- Birthday / DOB is personal CRM data — not part of the Quotation selling process.
-- Hard-delete matching custom fields (and their values) so they stop blocking create/save
-- and can be fully removed from Settings.

delete from public.tenant_custom_field_values v
using public.tenant_custom_field_definitions d
where v.tenant_id = d.tenant_id
  and btrim(v.entity_type) = btrim(d.entity_type)
  and v.field_key = d.field_key
  and d.entity_type = 'quo_quotation'
  and (
    lower(trim(d.label)) in (
      'birthday',
      'birth day',
      'birthdate',
      'birth date',
      'date of birth',
      'dob'
    )
    or lower(d.field_key) ~ '(birthday|birth_day|birthdate|birth_date|(^|_)dob($|_))'
  );

delete from public.tenant_custom_field_definitions
where entity_type = 'quo_quotation'
  and (
    lower(trim(label)) in (
      'birthday',
      'birth day',
      'birthdate',
      'birth date',
      'date of birth',
      'dob'
    )
    or lower(field_key) ~ '(birthday|birth_day|birthdate|birth_date|(^|_)dob($|_))'
  );
