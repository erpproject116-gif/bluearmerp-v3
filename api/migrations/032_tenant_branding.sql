-- Tenant branding: colors, labels, receipt header/footer, logos, user avatars
begin;

create table if not exists public.tenant_branding (
  tenant_id bigint primary key references public.tenants(id) on delete cascade,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint references public.users(id)
);

create table if not exists public.tenant_branding_assets (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('company_logo', 'user_avatar')),
  user_id bigint references public.users(id) on delete cascade,
  file_name varchar(500) not null,
  mime_type varchar(200),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_branding_assets_tenant
  on public.tenant_branding_assets (tenant_id, asset_kind);

create index if not exists idx_tenant_branding_assets_user
  on public.tenant_branding_assets (tenant_id, user_id)
  where asset_kind = 'user_avatar';

commit;
