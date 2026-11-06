-- Vanity public URL for /apply/{slug} and /careers/{slug} (alongside company_code).
begin;

alter table public.tenants
  add column if not exists public_careers_slug varchar(80);

comment on column public.tenants.public_careers_slug is
  'Optional kebab-case public path for /apply/{slug} and /careers/{slug}. company_code still works.';

create unique index if not exists uq_tenants_public_careers_slug_lower
  on public.tenants (lower(public_careers_slug))
  where public_careers_slug is not null and btrim(public_careers_slug) <> '';

commit;
