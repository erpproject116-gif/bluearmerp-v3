-- Process-policy template for every company.
-- On: official-receipt, payment-voucher, sales-invoice, and purchase-invoice auto-post,
-- and stock quantity adjustment approval.
-- Every other checkbox on Process flow policies is off.
-- Lot allocation, budget mode, discount accounts, and branch isolation are not changed.

alter table public.tenant_process_policies
  alter column legacy_combined_so_release set default false,
  alter column sales_order_require_attachment set default false,
  alter column sales_require_attachment set default false,
  alter column purchase_order_require_attachment set default false,
  alter column supplier_invoice_require_attachment set default false,
  alter column accounts_auto_post_or set default true,
  alter column accounts_auto_post_pv set default true,
  alter column accounts_auto_post_sales set default true,
  alter column accounts_auto_post_purchase set default true;

update public.tenant_process_policies set
  sales_require_quotation = false,
  sales_require_so = false,
  sales_require_reservation = false,
  sales_require_delivery_receipt = false,
  purchase_require_pr = false,
  purchase_require_pr_approval = false,
  purchase_require_gr_before_supplier_invoice = false,
  legacy_combined_so_release = false,
  sales_enforce_credit_limit = false,
  accounts_auto_post_or = true,
  accounts_auto_post_pv = true,
  accounts_auto_post_sales = true,
  accounts_auto_post_purchase = true,
  inventory_gl_hybrid_enabled = false,
  inventory_require_serial_adjustment_approval = false,
  inventory_require_stock_adjustment_approval = true,
  inventory_block_expired_lot_sales = false,
  sales_require_so_approval = false,
  purchase_require_po_approval = false,
  finance_require_je_approval = false,
  quotation_require_attachment = false,
  sales_order_require_attachment = false,
  sales_require_attachment = false,
  purchase_order_require_attachment = false,
  supplier_invoice_require_attachment = false,
  manufacturing_require_fg_qc = false,
  sales_count_completed_wo_toward_release = false,
  updated_at = now();
