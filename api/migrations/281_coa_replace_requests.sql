-- Chart of Accounts replace/wipe requests (maker-checker with required note).
begin;

create table if not exists public.fin_coa_replace_requests (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  template text not null default 'ph_sme',
  note text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  escalate_to_platform boolean not null default false,
  requested_by_user_id bigint not null references public.users(id),
  decided_by_user_id bigint references public.users(id),
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint fin_coa_replace_requests_note_nonempty check (length(trim(note)) > 0)
);

create index if not exists idx_fin_coa_replace_requests_tenant_status
  on public.fin_coa_replace_requests (tenant_id, status, created_at desc);

create index if not exists idx_fin_coa_replace_requests_platform
  on public.fin_coa_replace_requests (escalate_to_platform, status)
  where escalate_to_platform = true and status = 'pending';

commit;
