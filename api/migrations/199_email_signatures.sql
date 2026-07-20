-- Email compose UX: per-user HTML signatures for document email.
begin;

create table if not exists public.com_email_signatures (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  signature_html text not null default '',
  include_by_default boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists idx_com_email_signatures_tenant_user
  on public.com_email_signatures (tenant_id, user_id);

commit;
