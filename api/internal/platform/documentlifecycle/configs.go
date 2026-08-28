package documentlifecycle

func QuotationConfig() Config {
	return Config{
		Table: "quo_quotations", DocumentType: "quo_quotation",
		DisplayName: "Quotation", AuditTarget: "quo_quotation",
		Dependencies: []Dependency{
			{
				Code: "active_sales_orders", Kind: "downstream_document", Label: "Active sales orders",
				Query: `select count(*) from public.so_sales_orders
					where tenant_id = $1 and source_quotation_id = $2 and deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "quotation_slips", Kind: "downstream_slip", Label: "Quotation conversion slips",
				Query: `select count(*) from public.quo_quotation_slip_lines sl
					join public.quo_quotation_lines ql on ql.id = sl.quotation_line_id
					join public.quo_quotations q on q.id = ql.quotation_id
					where q.tenant_id = $1 and q.id = $2`,
				BlockDelete: true,
			},
		},
	}
}

func SalesOrderConfig() Config {
	return Config{
		Table: "so_sales_orders", DocumentType: "so_sales_order",
		DisplayName: "Sales order", AuditTarget: "so_sales_order",
		Dependencies: []Dependency{
			{
				Code: "active_sales", Kind: "downstream_document", Label: "Active sales invoices",
				Query: `select count(*) from public.sa_sales
					where tenant_id = $1 and source_sales_order_id = $2 and deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "release_slips", Kind: "downstream_slip", Label: "Released sales-order lines",
				Query: `select count(*) from public.so_sales_order_release_lines rl
					join public.so_sales_order_lines l on l.id = rl.sales_order_line_id
					join public.so_sales_orders so on so.id = l.sales_order_id
					where so.tenant_id = $1 and so.id = $2`,
				BlockDelete: true,
			},
			{
				Code: "delivery_receipts", Kind: "downstream_document", Label: "Delivery receipts",
				Query: `select count(*) from public.dr_delivery_receipts
					where tenant_id = $1 and sales_order_id = $2 and deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "shipping_orders", Kind: "downstream_document", Label: "Shipping orders",
				Query: `select count(*) from public.sh_shipping_orders
					where tenant_id = $1 and sales_order_id = $2`,
				BlockDelete: true,
			},
			{
				Code: "purchase_requests", Kind: "downstream_document", Label: "Purchase requests sourced from this sales order",
				Query: `select count(distinct pr.id) from public.pr_purchase_request_lines l
					join public.pr_purchase_requests pr on pr.id = l.purchase_request_id
					join public.so_sales_order_lines sol on sol.id = l.source_sales_order_line_id
					where pr.tenant_id = $1 and sol.sales_order_id = $2 and pr.deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "work_orders", Kind: "downstream_document", Label: "Work orders sourced from this sales order",
				Query: `select count(*) from public.mfg_work_orders wo
					where wo.tenant_id = $1 and wo.source_sales_order_id = $2 and wo.status <> 'cancelled'`,
				BlockDelete: true,
			},
			{
				Code: "deleted_source_quotation", Kind: "source_document", Label: "Deleted source quotation",
				Query: `select count(*) from public.so_sales_orders so
					join public.quo_quotations q on q.id = so.source_quotation_id
					where so.tenant_id = $1 and so.id = $2 and q.deleted_at is not null`,
				BlockRestore: true,
			},
		},
	}
}

func PurchaseRequestConfig() Config {
	return Config{
		Table: "pr_purchase_requests", DocumentType: "pr_purchase_request",
		DisplayName: "Purchase request", AuditTarget: "pr_purchase_request",
		Dependencies: []Dependency{
			{
				Code: "active_purchase_orders", Kind: "downstream_document", Label: "Active purchase orders",
				Query: `select count(*) from public.po_purchase_orders
					where tenant_id = $1 and purchase_request_id = $2 and deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "active_rfqs", Kind: "downstream_document", Label: "Active RFQs",
				Query: `select count(*) from public.rfq_requests
					where tenant_id = $1 and purchase_request_id = $2 and status <> 'cancelled'`,
				BlockDelete: true,
			},
			{
				Code: "purchase_request_slips", Kind: "downstream_slip", Label: "Purchase request conversion slips",
				Query: `select count(*) from public.pr_purchase_request_slip_lines sl
					join public.pr_purchase_request_lines l on l.id = sl.purchase_request_line_id
					join public.pr_purchase_requests pr on pr.id = l.purchase_request_id
					where pr.tenant_id = $1 and pr.id = $2`,
				BlockDelete: true,
			},
			{
				Code: "deleted_source_sales_order", Kind: "source_document", Label: "Deleted source sales order",
				Query: `select count(*) from public.pr_purchase_requests pr
					join public.so_sales_orders so on so.id = pr.source_sales_order_id
					where pr.tenant_id = $1 and pr.id = $2 and so.deleted_at is not null`,
				BlockRestore: true,
			},
		},
	}
}

func PurchaseOrderConfig() Config {
	return Config{
		Table: "po_purchase_orders", DocumentType: "po_purchase_order",
		DisplayName: "Purchase order", AuditTarget: "po_purchase_order",
		Dependencies: []Dependency{
			{
				Code: "non_draft_state", Kind: "document_state", Label: "Confirmed purchase order",
				Query: `select count(*) from public.po_purchase_orders
					where tenant_id = $1 and id = $2 and status <> 'draft'`,
				BlockDelete: true,
			},
			{
				Code: "goods_receipts", Kind: "downstream_document", Label: "Goods receipts",
				Query: `select count(*) from public.gr_goods_receipts
					where tenant_id = $1 and purchase_order_id = $2 and status <> 'cancelled'`,
				BlockDelete: true,
			},
			{
				Code: "supplier_invoices", Kind: "downstream_document", Label: "Active supplier invoices",
				Query: `select count(distinct si.id) from public.fin_supplier_invoice_lines sil
					join public.fin_supplier_invoices si on si.id = sil.supplier_invoice_id
					join public.po_purchase_order_lines pol on pol.id = sil.purchase_order_line_id
					where si.tenant_id = $1 and pol.purchase_order_id = $2 and si.deleted_at is null`,
				BlockDelete: true,
			},
			{
				Code: "purchase_returns", Kind: "downstream_document", Label: "Purchase returns",
				Query: `select count(distinct pr.id) from public.prt_purchase_return_lines l
					join public.prt_purchase_returns pr on pr.id = l.purchase_return_id
					join public.po_purchase_order_lines pol on pol.id = l.purchase_order_line_id
					where pr.tenant_id = $1 and pol.purchase_order_id = $2 and pr.status <> 'cancelled'`,
				BlockDelete: true,
			},
			{
				Code: "purchase_request_slips", Kind: "downstream_slip", Label: "Purchase-order conversion slips",
				Query: `select count(*) from public.pr_purchase_request_slip_lines sl
					join public.po_purchase_order_lines pol on pol.purchase_request_line_id = sl.purchase_request_line_id
					join public.po_purchase_orders po on po.id = pol.purchase_order_id
					where po.tenant_id = $1 and po.id = $2 and sl.slip_type = 'purchase_order'`,
				BlockDelete: true,
			},
			{
				Code: "deleted_source_purchase_request", Kind: "source_document", Label: "Deleted source purchase request",
				Query: `select count(*) from public.po_purchase_orders po
					join public.pr_purchase_requests pr on pr.id = po.purchase_request_id
					where po.tenant_id = $1 and po.id = $2 and pr.deleted_at is not null`,
				BlockRestore: true,
			},
		},
	}
}

func SaleConfig() Config {
	return Config{
		Table: "sa_sales", DocumentType: "sa_sale",
		DisplayName: "Sales invoice", AuditTarget: "sa_sales",
		Dependencies: []Dependency{
			{
				Code: "payments", Kind: "payment", Label: "Official receipt applications",
				Query: `select count(*) from public.fin_receipt_applications a
					join public.fin_official_receipts r on r.id = a.official_receipt_id
					where r.tenant_id = $1 and a.sales_id = $2 and r.deleted_at is null`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "posted_journal", Kind: "ledger", Label: "Posted invoice journal",
				Query: `select count(*) from public.sa_sales s
					join public.fin_journal_entries j on j.id = s.invoice_journal_entry_id
					where s.tenant_id = $1 and s.id = $2 and j.status = 'posted'`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "sales_returns", Kind: "return", Label: "Sales returns",
				Query: `select count(*) from public.sr_sales_returns
					where tenant_id = $1 and sales_id = $2 and status <> 'cancelled'`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "commissions", Kind: "commission", Label: "Commission accruals",
				Query: `select count(*) from public.sa_commission_accruals
					where tenant_id = $1 and sales_id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "serial_assignments", Kind: "serial_lot", Label: "Serial assignments",
				Query: `select count(*) from public.inv_serial_unit_sales_lines j
					join public.sa_sales_lines l on l.id = j.sales_line_id
					join public.sa_sales s on s.id = l.sales_id
					where s.tenant_id = $1 and s.id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "lot_assignments", Kind: "serial_lot", Label: "Lot assignments",
				Query: `select count(*) from public.sa_sales_lines l
					join public.sa_sales s on s.id = l.sales_id
					where s.tenant_id = $1 and s.id = $2 and l.lot_batch_id is not null`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "stock_movements", Kind: "inventory_ledger", Label: "Stock movements",
				Query: `select count(*) from public.inv_stock_movements m
					join public.sa_sales_lines l on l.id = m.ref_id and m.ref_type = 'sa_sales_line'
					join public.sa_sales s on s.id = l.sales_id
					where s.tenant_id = $1 and s.id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "downstream_slips", Kind: "downstream_slip", Label: "Sales-order conversion slips",
				Query: `select count(*) from public.so_sales_order_slip_lines sl
					join public.sa_sales s on s.id = sl.sales_id
					where s.tenant_id = $1 and s.id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
		},
	}
}

func SupplierInvoiceConfig() Config {
	return Config{
		Table: "fin_supplier_invoices", DocumentType: "fin_supplier_invoice",
		DisplayName: "Supplier invoice", AuditTarget: "fin_supplier_invoice",
		Dependencies: []Dependency{
			{
				Code: "payments", Kind: "payment", Label: "Payment voucher applications",
				Query: `select count(*) from public.fin_payment_applications a
					join public.fin_payment_vouchers p on p.id = a.payment_voucher_id
					where p.tenant_id = $1 and a.supplier_invoice_id = $2 and p.deleted_at is null`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "posted_journal", Kind: "ledger", Label: "Posted purchase journal",
				Query: `select count(*) from public.fin_supplier_invoices si
					join public.fin_journal_entries j on j.id = si.invoice_journal_entry_id
					where si.tenant_id = $1 and si.id = $2 and j.status = 'posted'`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "goods_receipt_slips", Kind: "downstream_slip", Label: "Goods-receipt invoice slips",
				Query: `select count(*) from public.gr_goods_receipt_slip_lines sl
					join public.fin_supplier_invoices si on si.id = sl.supplier_invoice_id
					where si.tenant_id = $1 and si.id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "purchase_returns", Kind: "return", Label: "Purchase returns on invoiced PO lines",
				Query: `select count(distinct pr.id) from public.prt_purchase_return_lines rl
					join public.prt_purchase_returns pr on pr.id = rl.purchase_return_id
					join public.fin_supplier_invoice_lines sil on sil.purchase_order_line_id = rl.purchase_order_line_id
					where pr.tenant_id = $1 and sil.supplier_invoice_id = $2 and pr.status <> 'cancelled'`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "serial_conflicts", Kind: "serial_lot", Label: "Serials no longer in stock",
				Query: `select count(*) from public.inv_serial_units su
					join public.fin_supplier_invoice_lines sil on sil.goods_receipt_line_id = su.goods_receipt_line_id
					join public.fin_supplier_invoices si on si.id = sil.supplier_invoice_id
					where si.tenant_id = $1 and si.id = $2 and su.status <> 'in_stock'`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "lot_conflicts", Kind: "serial_lot", Label: "Lot batches linked to invoiced receipts",
				Query: `select count(*) from public.inv_lot_batches lb
					join public.fin_supplier_invoice_lines sil on sil.goods_receipt_line_id = lb.goods_receipt_line_id
					join public.fin_supplier_invoices si on si.id = sil.supplier_invoice_id
					where si.tenant_id = $1 and si.id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
			{
				Code: "quality_requests", Kind: "downstream_document", Label: "Quality-control requests",
				Query: `select count(*) from public.qms_qc_requests
					where tenant_id = $1 and supplier_invoice_id = $2`,
				BlockDelete: true, BlockRestore: true,
			},
		},
	}
}
