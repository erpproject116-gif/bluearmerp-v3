-- Dependency-aware document soft-delete/restore metadata and immutable history.
begin;

alter table public.quo_quotations
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

alter table public.so_sales_orders
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

alter table public.sa_sales
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

alter table public.pr_purchase_requests
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

alter table public.po_purchase_orders
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

alter table public.fin_supplier_invoices
  add column if not exists deleted_by_user_id bigint references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by_user_id bigint references public.users(id),
  add column if not exists restore_reason text,
  add column if not exists lifecycle_version int not null default 0;

create index if not exists idx_quo_quotations_deleted
  on public.quo_quotations (tenant_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_so_sales_orders_deleted
  on public.so_sales_orders (tenant_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_sa_sales_deleted
  on public.sa_sales (tenant_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_pr_purchase_requests_deleted
  on public.pr_purchase_requests (tenant_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_po_purchase_orders_deleted
  on public.po_purchase_orders (tenant_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_fin_supplier_invoices_deleted
  on public.fin_supplier_invoices (tenant_id, deleted_at desc) where deleted_at is not null;

create table if not exists public.document_lifecycle_actions (
  id bigserial primary key,
  tenant_id bigint not null references public.tenants(id) on delete cascade,
  document_type varchar(60) not null check (document_type in (
    'quo_quotation', 'so_sales_order', 'sa_sale',
    'pr_purchase_request', 'po_purchase_order', 'fin_supplier_invoice'
  )),
  document_id bigint not null,
  action varchar(10) not null check (action in ('delete', 'restore')),
  reason text not null check (length(btrim(reason)) > 0),
  actor_user_id bigint not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_document_lifecycle_actions_document
  on public.document_lifecycle_actions (tenant_id, document_type, document_id, id desc);

create or replace function public.reject_document_lifecycle_action_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'document lifecycle actions are immutable';
end;
$$;

drop trigger if exists trg_document_lifecycle_actions_immutable
  on public.document_lifecycle_actions;
create trigger trg_document_lifecycle_actions_immutable
before update or delete on public.document_lifecycle_actions
for each row execute function public.reject_document_lifecycle_action_mutation();

commit;
