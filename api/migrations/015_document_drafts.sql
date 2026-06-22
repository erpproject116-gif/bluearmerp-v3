-- Per-user document drafts (autosave)
begin;

create table if not exists public.document_drafts (
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  entity_type text not null,
  draft_key text not null,
  payload jsonb not null default '{}',
  saved_at timestamptz not null default now(),
  primary key (tenant_id, user_id, entity_type, draft_key)
);

create index if not exists idx_document_drafts_saved
  on public.document_drafts (tenant_id, user_id, saved_at desc);

commit;
