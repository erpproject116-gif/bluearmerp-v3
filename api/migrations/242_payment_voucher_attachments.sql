-- Payment voucher attachments (receipts / images on New Payable Payment → Payments Journal).

create table if not exists public.fin_payment_voucher_attachments (
  id bigserial primary key,
  payment_voucher_id bigint not null references public.fin_payment_vouchers(id) on delete cascade,
  file_name varchar(255) not null,
  mime_type varchar(100),
  size_bytes bigint not null default 0,
  storage_path text not null,
  uploaded_by_user_id bigint references public.users(id),
  file_bytes bytea,
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_pv_attachments_voucher
  on public.fin_payment_voucher_attachments (payment_voucher_id);
