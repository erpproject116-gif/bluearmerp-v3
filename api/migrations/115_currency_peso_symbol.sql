-- Show a real currency symbol (Philippine Peso) instead of the word "Domestic".
-- Adds a symbol column and renames the default seeded currency in place so existing
-- FKs (quotations, sales, POs, etc. referencing currency_id) are preserved.
begin;

alter table public.quo_currencies
  add column if not exists symbol varchar(8);

-- Rename the legacy default "DOMESTIC" currency to PHP with the peso sign,
-- but only when the tenant does not already have a PHP row (unique tenant_id+currency_code).
update public.quo_currencies q
  set currency_code = 'PHP', name = 'Philippine Peso', symbol = '₱'
  where q.currency_code = 'DOMESTIC'
    and not exists (
      select 1 from public.quo_currencies c2
      where c2.tenant_id = q.tenant_id and c2.currency_code = 'PHP'
    );

-- Ensure any PHP rows carry the peso sign; default remaining symbols to their code.
update public.quo_currencies set symbol = '₱' where currency_code = 'PHP' and (symbol is null or symbol = '');
update public.quo_currencies set symbol = currency_code where symbol is null or symbol = '';

commit;
