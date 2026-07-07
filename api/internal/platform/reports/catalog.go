package reports

// ReportDef describes a registered analytics or status report.
type ReportDef struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Module      string `json:"module"`
	APIPath     string `json:"api_path"`
	ExportPath  string `json:"export_path,omitempty"`
	WebPath     string `json:"web_path,omitempty"`
	Tier        string `json:"tier"`
	Description string `json:"description,omitempty"`
}

// FindByKey returns a catalog entry by report key.
func FindByKey(key string) (ReportDef, bool) {
	for _, def := range Catalog() {
		if def.Key == key {
			return def, true
		}
	}
	return ReportDef{}, false
}

// Catalog returns all Tier R reports exposed by the platform.
func Catalog() []ReportDef {
	return []ReportDef{
		{
			Key: "so_analysis", Label: "Sales Order Analysis", Module: "sales-order",
			APIPath:    "/api/v1/sales-order/reports/so-analysis",
			ExportPath: "/api/v1/sales-order/reports/so-analysis/export",
			WebPath:    "/app/sales-order/reports/so-analysis", Tier: "R2",
			Description: "Order counts and totals by customer for a date range.",
		},
		{
			Key: "po_analysis", Label: "Purchase Order Analysis", Module: "purchase-order",
			APIPath:    "/api/v1/purchase-order/reports/po-analysis",
			ExportPath: "/api/v1/purchase-order/reports/po-analysis/export",
			WebPath:    "/app/purchase-order/reports/po-analysis", Tier: "R3",
			Description: "PO counts and totals by vendor for a date range.",
		},
		{
			Key: "items_to_receive", Label: "Items to Receive", Module: "purchase-order",
			APIPath:    "/api/v1/purchase-order/reports/items-to-receive",
			ExportPath: "/api/v1/purchase-order/reports/items-to-receive/export",
			WebPath:    "/app/purchase-order/reports/items-to-receive", Tier: "R3",
			Description: "Open PO lines with pending receipt quantity.",
		},
		{
			Key: "purchase_status", Label: "Purchase Status", Module: "buying",
			APIPath:    "/api/v1/buying/reports/purchase-status",
			ExportPath: "/api/v1/buying/reports/purchase-status/export",
			WebPath:    "/app/buying/reports/purchase-status", Tier: "R3",
			Description: "Supplier invoice line inquiry with Details/Summary/by Line.",
		},
		{
			Key: "stock_balance", Label: "Stock Balance", Module: "inventory",
			APIPath:    "/api/v1/inventory/reports/stock-balance",
			ExportPath: "/api/v1/inventory/reports/stock-balance/export",
			WebPath:    "/app/inventory/reports/stock-balance", Tier: "R4",
			Description: "On-hand and reserved quantity by item and location.",
		},
		{
			Key: "inventory_on_hand", Label: "Inventory Balance (On Hand)", Module: "inventory",
			APIPath:    "/api/v1/inventory/reports/on-hand",
			ExportPath: "/api/v1/inventory/reports/on-hand/export",
			WebPath:    "/app/inventory/reports/on-hand", Tier: "R4",
			Description: "Company-wide on-hand quantity with safety-stock filter.",
		},
		{
			Key: "inv_book", Label: "Inv. Book", Module: "inventory",
			APIPath:    "/api/v1/inventory/reports/inv-book",
			ExportPath: "/api/v1/inventory/reports/inv-book/export",
			WebPath:    "/app/inventory/reports/inv-book", Tier: "R4",
			Description: "Opening, receipt, issue, and closing qty by item.",
		},
		{
			Key: "stock_ledger", Label: "Stock Ledger", Module: "inventory",
			APIPath:    "/api/v1/inventory/reports/stock-ledger",
			ExportPath: "/api/v1/inventory/reports/stock-ledger/export",
			WebPath:    "/app/inventory/reports/stock-ledger", Tier: "R4",
			Description: "Stock movement history for a date range.",
		},
		{
			Key: "stock_ageing", Label: "Stock Ageing", Module: "inventory",
			APIPath:    "/api/v1/inventory/reports/stock-ageing",
			ExportPath: "/api/v1/inventory/reports/stock-ageing/export",
			WebPath:    "/app/inventory/reports/stock-ageing", Tier: "R4",
			Description: "Aging buckets for on-hand stock by item and location.",
		},
		{
			Key: "ar_by_customer", Label: "A/R by Customer", Module: "finance",
			APIPath:    "/api/v1/finance/ar-by-customer",
			ExportPath: "/api/v1/finance/ar-by-customer/export",
			WebPath:    "/app/finance/reports/ar-by-customer", Tier: "R5",
			Description: "Open receivables grouped by customer.",
		},
		{
			Key: "ap_by_vendor", Label: "A/P by Vendor", Module: "finance",
			APIPath:    "/api/v1/finance/ap-by-vendor",
			ExportPath: "/api/v1/finance/ap-by-vendor/export",
			WebPath:    "/app/finance/reports/ap-by-vendor", Tier: "R5",
			Description: "Open payables grouped by vendor.",
		},
		{
			Key: "ar_aging", Label: "A/R Aging", Module: "finance",
			APIPath:    "/api/v1/finance/ar-aging",
			ExportPath: "/api/v1/finance/ar-aging/export",
			WebPath:    "/app/finance/reports/ar-aging", Tier: "R5",
			Description: "Receivables balances bucketed by aging days.",
		},
		{
			Key: "ap_aging", Label: "A/P Aging", Module: "finance",
			APIPath:    "/api/v1/finance/ap-aging",
			ExportPath: "/api/v1/finance/ap-aging/export",
			WebPath:    "/app/finance/reports/ap-aging", Tier: "R5",
			Description: "Payables balances bucketed by aging days.",
		},
		{
			Key: "ar_ap_status", Label: "AR/AP Status", Module: "finance",
			APIPath:    "/api/v1/finance/reports/ar-ap-status",
			ExportPath: "/api/v1/finance/reports/ar-ap-status/export",
			WebPath:    "/app/finance/reports/ar-ap-status", Tier: "R5",
			Description: "Combined receivable and payable position as-of date.",
		},
		{
			Key: "trial_balance", Label: "Trial Balance", Module: "finance",
			APIPath:    "/api/v1/finance/reports/trial-balance",
			ExportPath: "/api/v1/finance/reports/trial-balance/export",
			WebPath:    "/app/finance/reports/trial-balance", Tier: "R5",
			Description: "Posted journal balances by account.",
		},
		{
			Key: "general_ledger", Label: "General Ledger", Module: "finance",
			APIPath:    "/api/v1/finance/reports/general-ledger",
			ExportPath: "/api/v1/finance/reports/general-ledger/export",
			WebPath:    "/app/finance/reports/general-ledger", Tier: "R5",
			Description: "Posted journal entry line detail.",
		},
		{
			Key: "profit_and_loss", Label: "Profit & Loss", Module: "finance",
			APIPath:    "/api/v1/finance/reports/profit-and-loss",
			ExportPath: "/api/v1/finance/reports/profit-and-loss/export",
			WebPath:    "/app/finance/reports/profit-and-loss", Tier: "R5",
			Description: "Income and expense balances for a date range.",
		},
		{
			Key: "balance_sheet", Label: "Balance Sheet", Module: "finance",
			APIPath:    "/api/v1/finance/reports/balance-sheet",
			ExportPath: "/api/v1/finance/reports/balance-sheet/export",
			WebPath:    "/app/finance/reports/balance-sheet", Tier: "R5",
			Description: "Asset, liability, and equity balances.",
		},
		{
			Key: "customer_credit_balance", Label: "Customer Credit Balance", Module: "sales",
			APIPath: "/api/v1/sales/reports/customer-credit-balance",
			WebPath: "/app/sales/reports/customer-credit-balance", Tier: "R6",
			Description: "Credit limit and open balance per customer.",
		},
		{
			Key: "customer_quotations", Label: "Customer Quotations by Item", Module: "crm",
			APIPath:    "/api/v1/crm/reports/customer-quotations-by-item",
			ExportPath: "/api/v1/crm/reports/customer-quotations-by-item/export",
			WebPath:    "/app/crm/reports/customer-quotations", Tier: "R7",
			Description: "Quotation counts and totals by customer and item.",
		},
		{
			Key: "item_demand", Label: "Item Demand", Module: "crm",
			APIPath:    "/api/v1/crm/reports/item-demand",
			ExportPath: "/api/v1/crm/reports/item-demand/export",
			WebPath:    "/app/crm/reports/item-demand", Tier: "R7",
			Description: "Quoted vs sold quantity and amount by item.",
		},
		{
			Key: "conversion_funnel", Label: "Conversion Funnel", Module: "crm",
			APIPath:    "/api/v1/crm/reports/conversion-funnel",
			ExportPath: "/api/v1/crm/reports/conversion-funnel/export",
			WebPath:    "/app/crm/reports/conversion", Tier: "R7",
			Description: "Quotation-to-sales pipeline stage counts.",
		},
		{
			Key: "low_stock", Label: "Low Stock", Module: "crm",
			APIPath:    "/api/v1/crm/reports/low-stock",
			ExportPath: "/api/v1/crm/reports/low-stock/export",
			WebPath:    "/app/crm/reports/low-stock", Tier: "R7",
			Description: "SKUs below reorder level by location.",
		},
		{
			Key: "expired_quotations", Label: "Expired Quotations", Module: "crm",
			APIPath:    "/api/v1/crm/reports/expired-quotations",
			ExportPath: "/api/v1/crm/reports/expired-quotations/export",
			WebPath:    "/app/crm/reports/expired-quotations", Tier: "R7",
			Description: "Quotation lines past validity date.",
		},
		{
			Key: "budget_vs_actual", Label: "Budget vs Actual", Module: "finance",
			APIPath:    "/api/v1/company-budget/budgets/{id}/vs-actual",
			ExportPath: "/api/v1/company-budget/budgets/{id}/vs-actual/export",
			WebPath:    "/app/finance/reports/budget-vs-actual", Tier: "R5",
			Description: "Budget lines compared to posted journal activity.",
		},
		{
			Key: "withholding_codes", Label: "Withholding Tax Codes", Module: "finance",
			APIPath: "/api/v1/finance/withholding-codes",
			WebPath: "/app/finance/acct-ii/withholding-codes", Tier: "R5",
			Description: "Acct. II BIR-style withholding rate master (2307 support).",
		},
		{
			Key: "check_register", Label: "Check Register", Module: "finance",
			APIPath: "/api/v1/finance/checks",
			WebPath: "/app/finance/acct-ii/checks", Tier: "R5",
			Description: "Acct. II issued checks and cleared status.",
		},
		{
			Key: "notes_receivable_payable", Label: "Notes Receivable/Payable", Module: "finance",
			APIPath: "/api/v1/finance/notes",
			WebPath: "/app/finance/acct-ii/notes", Tier: "R5",
			Description: "Acct. II promissory notes with due dates.",
		},
		{
			Key: "landed_cost", Label: "Landed Cost", Module: "finance",
			APIPath: "/api/v1/finance/landed-costs",
			WebPath: "/app/finance/acct-ii/landed-costs", Tier: "R5",
			Description: "Acct. II import cost allocation to goods receipts.",
		},
		{
			Key: "contracts", Label: "Contracts", Module: "finance",
			APIPath: "/api/v1/finance/contracts",
			WebPath: "/app/finance/acct-ii/contracts", Tier: "R5",
			Description: "Acct. II contract and milestone billing headers.",
		},
		{
			Key: "wms_scheduled_receipts", Label: "Scheduled Receipts", Module: "inventory",
			APIPath: "/api/v1/wms/scheduled-receipts",
			WebPath: "/app/inventory/wms/scheduled-receipts", Tier: "R4",
			Description: "Inbound PO lines scheduled for warehouse receipt.",
		},
		{
			Key: "shipping_orders", Label: "Shipping Orders", Module: "sales-order",
			APIPath: "/api/v1/shipping/orders",
			WebPath: "/app/sales-order/shipping/orders", Tier: "R2",
			Description: "Outbound shipping orders linked to sales orders.",
		},
		{
			Key: "data_center_inbox", Label: "Data Center Inbox", Module: "data_center",
			APIPath: "/api/v1/data-center/inbox",
			WebPath: "/app/data-center/inbox", Tier: "R8",
			Description: "Ingested documents awaiting generation.",
		},
	}
}
