-- Payment method depth + payment discount applications (AR/AP New Payment Phase 3).
begin;

-- First-class OR/PV payment methods (Note / Other Account / Card).
alter table public.fin_official_receipts drop constraint if exists fin_official_receipts_payment_method_check;
alter table public.fin_official_receipts
  add constraint fin_official_receipts_payment_method_check
  check (payment_method in ('cash', 'check', 'bank_transfer', 'note', 'other', 'card'));

alter table public.fin_payment_vouchers drop constraint if exists fin_payment_vouchers_payment_method_check;
alter table public.fin_payment_vouchers
  add constraint fin_payment_vouchers_payment_method_check
  check (payment_method in ('cash', 'check', 'bank_transfer', 'note', 'other', 'card'));

-- Discount portion on applications (cash applied stays in applied_amount).
alter table public.fin_receipt_applications
  add column if not exists discount_amount numeric(18,4) not null default 0
  check (discount_amount >= 0);

alter table public.fin_payment_applications
  add column if not exists discount_amount numeric(18,4) not null default 0
  check (discount_amount >= 0);

-- Allow discount-only or cash-only lines (at least one positive).
alter table public.fin_receipt_applications drop constraint if exists fin_receipt_applications_applied_amount_check;
alter table public.fin_receipt_applications
  add constraint fin_receipt_applications_applied_amount_check check (applied_amount >= 0);
alter table public.fin_receipt_applications drop constraint if exists fin_receipt_applications_amounts_positive;
alter table public.fin_receipt_applications
  add constraint fin_receipt_applications_amounts_positive
  check (applied_amount + discount_amount > 0);

alter table public.fin_payment_applications drop constraint if exists fin_payment_applications_applied_amount_check;
alter table public.fin_payment_applications
  add constraint fin_payment_applications_applied_amount_check check (applied_amount >= 0);
alter table public.fin_payment_applications drop constraint if exists fin_payment_applications_amounts_positive;
alter table public.fin_payment_applications
  add constraint fin_payment_applications_amounts_positive
  check (applied_amount + discount_amount > 0);

-- Process-policy GL accounts for payment discounts (no silent write-offs).
alter table public.tenant_process_policies
  add column if not exists ar_payment_discount_account_id bigint references public.fin_accounts(id),
  add column if not exists ap_payment_discount_account_id bigint references public.fin_accounts(id);

commit;
