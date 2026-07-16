package onboarding

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/setupreadiness"
)

type trackStepDef struct {
	ID          string
	Label       string
	Href        string
	Description string
	KbArticleID string
	Required    bool
}

type trackDef struct {
	ID          string
	Title       string
	Description string
	ModuleCode  string // empty = always show
	Steps       []trackStepDef
}

var onboardingTracks = []trackDef{
	{
		ID:          "foundation",
		Title:       "Workspace foundation",
		Description: "Company, accounts, tax, locations, partners, and products — required before transactions.",
		Steps:       nil, // filled from setupreadiness
	},
	{
		ID:          "admin",
		Title:       "Administration",
		Description: "Process policies, optional modules, and team access.",
		Steps: []trackStepDef{
			{ID: "process_policies", Label: "Review process policies", Href: "/app/user-management/process-policies", Description: "Set quotation-before-SO, GR-before-invoice, attachment requirements, and release mode gates.", KbArticleID: "process-policies-foundation", Required: false},
			{ID: "tenant_modules", Label: "Review modules & features", Href: "/app/user-management/tenant-modules", Description: "Enable POS, WMS, Data Center, Quality, and other optional modules.", Required: false},
			{ID: "mapping_center", Label: "Review Mapping Center", Href: "/app/user-management/mapping-center", Description: "Configure Generate Other Slips rules between documents.", Required: false},
			{ID: "invite_team", Label: "Invite your team", Href: "/app/user-management/users", Description: "Add colleagues with roles and permissions.", KbArticleID: "user-management-admin", Required: false},
		},
	},
	{
		ID:          "selling",
		Title:       "Selling",
		Description: "Quotation through sales invoice and customer payment.",
		Steps: []trackStepDef{
			{ID: "quotation", Label: "Create a quotation", Href: "/app/quotation/quotations/new", Description: "Send a formal price offer to a customer.", KbArticleID: "quotation-to-sales-flow", Required: false},
			{ID: "sales_order", Label: "Create a sales order", Href: "/app/sales-order/sales-orders/new", Description: "Confirm the order — use Load Slip → Quotation to copy open quote lines.", KbArticleID: "sales-order-load-slip-quotation", Required: false},
			{ID: "so_release", Label: "Release stock (Pick List)", Href: "/app/sales-order/sales-orders/release", Description: "Allocate quantities and serial numbers for fulfillment.", KbArticleID: "sales-order-release", Required: false},
			{ID: "delivery_note", Label: "Post a delivery note", Href: "/app/sales-order/delivery-receipts/new", Description: "Record outbound shipment when using split release mode.", KbArticleID: "sales-order-release", Required: false},
			{ID: "sales_invoice", Label: "Create a sales invoice", Href: "/app/sales/sales/new", Description: "Use Load Slip to pull lines from sales order, quotation, or shipping order.", KbArticleID: "load-slip-overview", Required: false},
			{ID: "official_receipt", Label: "Record customer payment", Href: "/app/finance/official-receipts/new", Description: "Apply cash or check to open sales invoices.", KbArticleID: "sales-cash-in-after-save", Required: false},
		},
	},
	{
		ID:          "buying",
		Title:       "Buying",
		Description: "Purchase request through goods receipt and supplier invoice.",
		Steps: []trackStepDef{
			{ID: "purchase_request", Label: "Create a purchase request", Href: "/app/purchase-request/purchase-requests/new", Description: "List what to buy — optional Load Slip from Sales Order for demand.", KbArticleID: "purchase-request-load-slip-so", Required: false},
			{ID: "rfq_quotes", Label: "Request vendor quotes (RFQ)", Href: "/app/purchase-order/rfq", Description: "Optional: collect supplier quotations before ordering.", KbArticleID: "rfq-workflow", Required: false},
			{ID: "purchase_order", Label: "Create a purchase order", Href: "/app/purchase-order/purchase-orders/new", Description: "Load Slip from Purchase Request or Supplier Quotation.", KbArticleID: "purchase-order-load-slip-pr", Required: false},
			{ID: "goods_receipt", Label: "Receive goods (GR)", Href: "/app/purchase-order/goods-receipt", Description: "Post a goods receipt to increase stock.", KbArticleID: "purchase-request-to-ap-flow", Required: false},
			{ID: "gr_serial_scan", Label: "Scan serials on receive", Href: "/app/purchase-order/goods-receipt", Description: "Scan item codes and serial numbers on draft GR lines.", KbArticleID: "serial-barcode-scanning", Required: false},
			{ID: "supplier_invoice", Label: "Create a supplier invoice", Href: "/app/finance/supplier-invoices/new", Description: "Load Slip from GR, PO, or RFQ-sourced PO lines.", KbArticleID: "load-slip-overview", Required: false},
			{ID: "purchase_pre_invoicing", Label: "Review purchase pre-invoicing", Href: "/app/buying/reports/pre-invoicing", Description: "See received stock not yet on a supplier invoice.", KbArticleID: "purchase-pre-invoicing-report", Required: false},
			{ID: "payment_voucher", Label: "Pay the supplier", Href: "/app/finance/payment-vouchers/new", Description: "Apply a payment voucher to supplier invoices.", KbArticleID: "finance-accounts-overview", Required: false},
		},
	},
	{
		ID:          "serials",
		Title:       "Serial & barcode tracking",
		Description: "End-to-end serial scanning on receive and sale.",
		Steps: []trackStepDef{
			{ID: "serial_item", Label: "Enable Track serial on an item", Href: "/app/inventory/items", Description: "Turn on serial tracking for products you scan individually.", Required: false},
			{ID: "serial_receive", Label: "Receive serials on a GR", Href: "/app/purchase-order/goods-receipt", Description: "Scan each unit when goods arrive.", Required: false},
			{ID: "serial_sale", Label: "Scan serials on a sale", Href: "/app/sales/sales/new", Description: "Match serial count to quantity on sales invoices.", Required: false},
			{ID: "serial_trace", Label: "Trace a serial number", Href: "/app/inventory/serial-lot/trace", Description: "Look up full history of one unit.", Required: false},
		},
	},
	{
		ID:          "pos",
		Title:       "Point of Sale",
		Description: "Retail terminal, catalog, shifts, and barcode checkout.",
		ModuleCode:  "pos",
		Steps: []trackStepDef{
			{ID: "pos_manage", Label: "Configure POS Manage", Href: "/app/pos/manage", Description: "Set default location, tax type, tax-inclusive pricing, and barcode scanning.", Required: false},
			{ID: "pos_categories", Label: "Organize POS categories", Href: "/app/inventory/items/settings", Description: "Style item categories — they appear as POS quick-grid tabs.", Required: false},
			{ID: "pos_catalog", Label: "Prepare POS catalog items", Href: "/app/inventory/items", Description: "Active items with categories and sales prices show on the terminal.", Required: false},
			{ID: "pos_open_shift", Label: "Open a POS shift", Href: "/app/pos", Description: "Start a session with opening cash at the terminal.", Required: false},
			{ID: "pos_checkout", Label: "Complete a POS checkout", Href: "/app/pos", Description: "Add items to the cart and take payment — creates a sales invoice.", Required: false},
			{ID: "pos_serial_checkout", Label: "Scan serials at POS", Href: "/app/pos", Description: "For serial-tracked items, scan the serial before checkout succeeds.", Required: false},
			{ID: "pos_close_shift", Label: "Close the shift", Href: "/app/pos", Description: "End of day — count cash and review the shift report.", Required: false},
		},
	},
	{
		ID:          "finance",
		Title:       "Accounts & reporting",
		Description: "General ledger, bank reconciliation, and financial statements.",
		Steps: []trackStepDef{
			{ID: "receivable_payable", Label: "Receivable / Payable status", Href: "/app/selling/reports/receivable-status", Description: "Open customer or vendor balances as-of a date.", KbArticleID: "receivable-payable-status", Required: false},
			{ID: "customer_vendor_book", Label: "Customer/Vendor Book", Href: "/app/finance/reports/customer-vendor-book-ar", Description: "Slip-level AR or AP ledger for a date range.", KbArticleID: "customer-vendor-book-report", Required: false},
			{ID: "journal_entry", Label: "Post a journal entry", Href: "/app/finance/acct-i/journal-entries", Description: "Manual GL adjustments when needed.", Required: false},
			{ID: "trial_balance", Label: "Review trial balance", Href: "/app/finance/acct-i/reports/trial-balance", Description: "Confirm accounts balance before month-end.", Required: false},
			{ID: "bank_recon", Label: "Bank reconciliation", Href: "/app/finance/acct-i/bank-reconciliation", Description: "Match bank statement lines to receipts and vouchers.", Required: false},
		},
	},
	{
		ID:          "operations_hub",
		Title:       "Operations Hub",
		Description: "Project workspaces, Kanban boards, and ERP-linked work items.",
		ModuleCode:  "operations",
		Steps: []trackStepDef{
			{ID: "operations_workspace", Label: "Open Work Hub", Href: "/app/operations", Description: "Pick a workspace and review the Kanban or table view.", KbArticleID: "operations-hub-intro", Required: false},
			{ID: "operations_work_item", Label: "Create or move a work item", Href: "/app/operations", Description: "Add a card or drag one across columns.", KbArticleID: "operations-hub-intro", Required: false},
		},
	},
	{
		ID:          "communications",
		Title:       "Communications",
		Description: "Email documents with PDF attachments and review sent history.",
		ModuleCode:  "comms",
		Steps: []trackStepDef{
			{ID: "comms_sent_log", Label: "Review sent documents", Href: "/app/comms/sent-documents", Description: "See delivery status for outbound document emails.", KbArticleID: "communications-overview", Required: false},
			{ID: "comms_send_document", Label: "Email a saved document", Href: "/app/quotation/quotations", Description: "Use Email on a quotation, order, or invoice after save.", KbArticleID: "document-email-workflow", Required: false},
		},
	},
	{
		ID:          "operations",
		Title:       "CRM, after-sales & quality",
		Description: "Customer follow-up, repairs, and optional quality workflows.",
		Steps: []trackStepDef{
			{ID: "crm_dashboard", Label: "Open CRM dashboard", Href: "/app/crm/dashboard", Description: "Personal pipeline, tasks, and warranty alerts.", Required: false},
			{ID: "follow_up_task", Label: "Create a follow-up task", Href: "/app/crm/follow-up-tasks", Description: "Schedule a call or visit for a customer.", KbArticleID: "crm-operations-tasks-sync", Required: false},
			{ID: "repair_order", Label: "Log a repair order", Href: "/app/after-sales/repair-orders/new", Description: "Track after-sales service and parts consumption.", Required: false},
			{ID: "support_ticket", Label: "Create a support ticket", Href: "/app/support/tickets", Description: "Log a customer issue linked to warranty assets.", Required: false},
			{ID: "quality_ncr", Label: "Record a quality NCR", Href: "/app/quality/ncrs", Description: "Document non-conformance on received goods.", Required: false},
		},
	},
	{
		ID:          "insights",
		Title:       "Dashboard & data health",
		Description: "Business KPIs, reports, and reconciliation.",
		Steps: []trackStepDef{
			{ID: "business_dashboard", Label: "Review Business Dashboard", Href: "/app/dashboard", Description: "Sales MTD, red flags, and top customers.", Required: false},
			{ID: "stock_reconciliation", Label: "Check stock reconciliation", Href: "/app/inventory/stock-reconciliation", Description: "Fix serial qty gaps, GR/invoice mismatches, and SO release gaps.", Required: false},
			{ID: "report_catalog", Label: "Browse report catalog", Href: "/app/reports", Description: "Module analytics and saved filter views.", Required: false},
		},
	},
}

type extendedAck struct {
	ProcessPoliciesAck bool `json:"process_policies_ack"`
	MappingCenterAck   bool `json:"mapping_center_ack"`
	ModulesReviewAck   bool `json:"modules_review_ack"`
	BusinessDashboardAck bool `json:"business_dashboard_ack"`
	PosManageAck       bool `json:"pos_manage_ack"`
	StockReconAck      bool `json:"stock_reconciliation_ack"`
	ReportCatalogAck     bool `json:"report_catalog_ack"`
	ReportsPracticeAck   bool `json:"reports_practice_ack"`
	TrialBalanceAck      bool `json:"trial_balance_ack"`
}

type detectionSnapshot struct {
	Quotation          bool
	SalesOrder         bool
	SORelease          bool
	DeliveryNote       bool
	SalesInvoice       bool
	OfficialReceipt    bool
	PurchaseRequest    bool
	RFQ                bool
	PurchaseOrder      bool
	GoodsReceipt       bool
	GRSerial           bool
	SupplierInvoice    bool
	PaymentVoucher     bool
	SerialItem         bool
	SerialReceive      bool
	SerialSale         bool
	PosLocationSet     bool
	PosCategories      bool
	PosCatalogItems    bool
	PosSession         bool
	PosCheckout        bool
	PosSerialCheckout  bool
	PosShiftClosed     bool
	JournalEntry       bool
	BankRecon          bool
	FollowUpTask       bool
	RepairOrder        bool
	SupportTicket      bool
	QualityNCR         bool
	TeamInvited        bool
	OperationsWorkspace bool
	OperationsWorkItem  bool
	CommsSent          bool
}

func buildTracks(ctx context.Context, pool *pgxpool.Pool, tenantID int64, readiness setupreadiness.Payload) ([]map[string]any, int, map[string]any) {
	ack := loadExtendedAck(ctx, pool, tenantID)
	snap := detectSnapshot(ctx, pool, tenantID)
	modules := loadEnabledModules(ctx, pool, tenantID)

	tracks := make([]map[string]any, 0, len(onboardingTracks))
	totalSteps := 0
	doneSteps := 0

	for _, def := range onboardingTracks {
		if def.ModuleCode != "" && !modules[def.ModuleCode] {
			continue
		}
		steps := def.Steps
		if def.ID == "foundation" {
			steps = foundationStepsFromReadiness(readiness)
		}
		if len(steps) == 0 {
			continue
		}

		stepMaps := make([]map[string]any, 0, len(steps))
		trackDone := 0
		for _, s := range steps {
			done := stepDone(def.ID, s.ID, readiness, ack, snap)
			if done {
				trackDone++
			}
			totalSteps++
			if done {
				doneSteps++
			}
			m := map[string]any{
				"id": s.ID, "label": s.Label, "href": s.Href, "done": done, "required": s.Required,
			}
			if s.Description != "" {
				m["description"] = s.Description
			}
			if s.KbArticleID != "" {
				m["kb_article_id"] = s.KbArticleID
			}
			if isAckStep(s.ID) {
				m["ack_step"] = true
			}
			stepMaps = append(stepMaps, m)
		}
		pct := 0
		if len(steps) > 0 {
			pct = (trackDone * 100) / len(steps)
		}
		tracks = append(tracks, map[string]any{
			"id": def.ID, "title": def.Title, "description": def.Description,
			"percent": pct, "steps": stepMaps,
		})
	}

	overall := 0
	if totalSteps > 0 {
		overall = (doneSteps * 100) / totalSteps
	}
	return tracks, overall, map[string]any{
		"pos_enabled": modules["pos"],
		"foundation_required_complete": readiness.RequiredComplete,
	}
}

func foundationStepsFromReadiness(readiness setupreadiness.Payload) []trackStepDef {
	out := make([]trackStepDef, 0)
	for _, s := range readiness.Steps {
		if s.ID == "ready" {
			continue
		}
		out = append(out, trackStepDef{
			ID: s.ID, Label: s.Label, Href: s.Href, Required: s.Required,
		})
	}
	return out
}

func stepDone(trackID, stepID string, readiness setupreadiness.Payload, ack extendedAck, snap detectionSnapshot) bool {
	if trackID == "foundation" {
		for _, s := range readiness.Steps {
			if s.ID == stepID {
				return s.Done
			}
		}
		return false
	}
	switch stepID {
	case "process_policies":
		return ack.ProcessPoliciesAck
	case "tenant_modules":
		return ack.ModulesReviewAck
	case "mapping_center":
		return ack.MappingCenterAck
	case "invite_team":
		return snap.TeamInvited
	case "quotation":
		return snap.Quotation
	case "sales_order":
		return snap.SalesOrder
	case "so_release":
		return snap.SORelease
	case "delivery_note":
		return snap.DeliveryNote
	case "sales_invoice":
		return snap.SalesInvoice
	case "official_receipt":
		return snap.OfficialReceipt
	case "purchase_request":
		return snap.PurchaseRequest
	case "rfq_quotes":
		return snap.RFQ
	case "purchase_order":
		return snap.PurchaseOrder
	case "goods_receipt":
		return snap.GoodsReceipt
	case "gr_serial_scan":
		return snap.GRSerial
	case "supplier_invoice":
		return snap.SupplierInvoice
	case "purchase_pre_invoicing", "receivable_payable", "customer_vendor_book":
		return ack.ReportsPracticeAck
	case "payment_voucher":
		return snap.PaymentVoucher
	case "serial_item":
		return snap.SerialItem
	case "serial_receive":
		return snap.SerialReceive
	case "serial_sale":
		return snap.SerialSale
	case "serial_trace":
		return snap.SerialReceive && snap.SerialSale
	case "pos_manage":
		return ack.PosManageAck || snap.PosLocationSet
	case "pos_categories":
		return snap.PosCategories
	case "pos_catalog":
		return snap.PosCatalogItems
	case "pos_open_shift":
		return snap.PosSession
	case "pos_checkout":
		return snap.PosCheckout
	case "pos_serial_checkout":
		return snap.PosSerialCheckout
	case "pos_close_shift":
		return snap.PosShiftClosed
	case "journal_entry":
		return snap.JournalEntry
	case "trial_balance":
		return ack.TrialBalanceAck
	case "bank_recon":
		return snap.BankRecon
	case "crm_dashboard":
		return ack.BusinessDashboardAck || snap.FollowUpTask
	case "follow_up_task":
		return snap.FollowUpTask
	case "operations_workspace":
		return snap.OperationsWorkspace
	case "operations_work_item":
		return snap.OperationsWorkItem
	case "comms_sent_log":
		return snap.CommsSent
	case "comms_send_document":
		return snap.CommsSent
	case "repair_order":
		return snap.RepairOrder
	case "support_ticket":
		return snap.SupportTicket
	case "quality_ncr":
		return snap.QualityNCR
	case "business_dashboard":
		return ack.BusinessDashboardAck
	case "stock_reconciliation":
		return ack.StockReconAck
	case "report_catalog":
		return ack.ReportCatalogAck
	default:
		return false
	}
}

func isAckStep(stepID string) bool {
	switch stepID {
	case "process_policies", "tenant_modules", "mapping_center", "pos_manage",
		"business_dashboard", "stock_reconciliation", "report_catalog", "trial_balance",
		"purchase_pre_invoicing", "receivable_payable", "customer_vendor_book":
		return true
	default:
		return false
	}
}

var ackStepKeys = map[string]string{
	"process_policies":      "process_policies_ack",
	"tenant_modules":        "modules_review_ack",
	"mapping_center":        "mapping_center_ack",
	"pos_manage":            "pos_manage_ack",
	"business_dashboard":    "business_dashboard_ack",
	"stock_reconciliation":  "stock_reconciliation_ack",
	"report_catalog":        "report_catalog_ack",
	"reports_practice":      "reports_practice_ack",
	"purchase_pre_invoicing": "reports_practice_ack",
	"receivable_payable":    "reports_practice_ack",
	"customer_vendor_book":  "reports_practice_ack",
	"trial_balance":         "trial_balance_ack",
}

func AckOnboardingStep(ctx context.Context, pool *pgxpool.Pool, tenantID int64, stepID string) error {
	key, ok := ackStepKeys[stepID]
	if !ok {
		return nil
	}
	blob, _ := json.Marshal(map[string]any{key: true})
	_, err := pool.Exec(ctx, `
		update public.platform_customers
		set onboarding_progress = coalesce(onboarding_progress, '{}'::jsonb) || $2::jsonb,
		    updated_at = now()
		where tenant_id = $1`, tenantID, string(blob))
	return err
}

func loadExtendedAck(ctx context.Context, pool *pgxpool.Pool, tenantID int64) extendedAck {
	var raw []byte
	_ = pool.QueryRow(ctx, `
		select coalesce(onboarding_progress, '{}'::jsonb)
		from public.platform_customers where tenant_id = $1 limit 1`, tenantID).Scan(&raw)
	var ack extendedAck
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &ack)
	}
	return ack
}

func loadEnabledModules(ctx context.Context, pool *pgxpool.Pool, tenantID int64) map[string]bool {
	out := map[string]bool{"pos": true, "crm": true, "quality": true, "support": true}
	rows, err := pool.Query(ctx, `
		select module_code, is_enabled from public.tenant_modules where tenant_id = $1`, tenantID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var code string
		var enabled bool
		if rows.Scan(&code, &enabled) == nil {
			out[code] = enabled
		}
	}
	return out
}

func detectSnapshot(ctx context.Context, pool *pgxpool.Pool, tenantID int64) detectionSnapshot {
	var s detectionSnapshot
	count := func(q string, args ...any) int {
		var n int
		_ = pool.QueryRow(ctx, q, args...).Scan(&n)
		return n
	}
	exists := func(q string, args ...any) bool {
		return count(q, args...) > 0
	}

	s.Quotation = exists(`select count(*)::int from public.quo_quotations where tenant_id=$1 and deleted_at is null`, tenantID)
	s.SalesOrder = exists(`select count(*)::int from public.so_sales_orders where tenant_id=$1 and deleted_at is null`, tenantID)
	s.SORelease = exists(`
		select count(*)::int from public.so_sales_order_release_lines rl
		join public.so_sales_orders so on so.id = rl.sales_order_id
		where so.tenant_id=$1`, tenantID)
	s.DeliveryNote = exists(`
		select count(*)::int from public.dr_delivery_receipts
		where tenant_id=$1 and deleted_at is null and status = 'posted'`, tenantID)
	s.SalesInvoice = exists(`select count(*)::int from public.sa_sales where tenant_id=$1 and deleted_at is null`, tenantID)
	s.OfficialReceipt = exists(`select count(*)::int from public.fin_official_receipts where tenant_id=$1 and deleted_at is null`, tenantID)
	s.PurchaseRequest = exists(`select count(*)::int from public.pr_purchase_requests where tenant_id=$1 and deleted_at is null`, tenantID)
	s.RFQ = exists(`select count(*)::int from public.rfq_requests where tenant_id=$1`, tenantID)
	s.PurchaseOrder = exists(`select count(*)::int from public.po_purchase_orders where tenant_id=$1 and deleted_at is null`, tenantID)
	s.GoodsReceipt = exists(`
		select count(*)::int from public.gr_goods_receipts
		where tenant_id=$1 and deleted_at is null and status = 'posted'`, tenantID)
	s.GRSerial = exists(`
		select count(*)::int from public.gr_goods_receipt_serials gs
		join public.gr_goods_receipt_lines grl on grl.id = gs.goods_receipt_line_id
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		where gr.tenant_id=$1`, tenantID)
	s.SupplierInvoice = exists(`select count(*)::int from public.fin_supplier_invoices where tenant_id=$1 and deleted_at is null`, tenantID)
	s.PaymentVoucher = exists(`select count(*)::int from public.fin_payment_vouchers where tenant_id=$1 and deleted_at is null`, tenantID)

	s.SerialItem = exists(`
		select count(*)::int from public.inv_items
		where tenant_id=$1 and deleted_at is null and track_serial = true`, tenantID)
	s.SerialReceive = exists(`
		select count(*)::int from public.inv_serial_units
		where tenant_id=$1 and deleted_at is null`, tenantID)
	s.SerialSale = exists(`
		select count(*)::int from public.inv_serial_unit_sales_lines sl
		join public.sa_sales_lines sal on sal.id = sl.sales_line_id
		join public.sa_sales s on s.id = sal.sales_id
		where s.tenant_id=$1`, tenantID)

	_ = pool.QueryRow(ctx, `
		select default_location_id is not null and default_tax_type_id is not null
		from public.pos_settings where tenant_id=$1`, tenantID).Scan(&s.PosLocationSet)
	s.PosCategories = exists(`
		select count(*)::int from public.inv_item_categories
		where tenant_id=$1 and active = true`, tenantID)
	s.PosCatalogItems = exists(`
		select count(*)::int from public.inv_items
		where tenant_id=$1 and deleted_at is null and status='active' and item_category_id is not null`, tenantID)
	s.PosSession = exists(`select count(*)::int from public.pos_sessions where tenant_id=$1`, tenantID)
	s.PosCheckout = exists(`
		select count(*)::int from public.pos_tenders t
		join public.pos_sessions ps on ps.id = t.session_id
		where ps.tenant_id=$1`, tenantID)
	s.PosSerialCheckout = exists(`
		select count(*)::int from public.pos_cart_lines cl
		join public.pos_sessions ps on ps.id = cl.session_id
		where ps.tenant_id=$1 and cardinality(coalesce(cl.serial_unit_ids, '{}')) > 0`, tenantID) || s.SerialSale
	s.PosShiftClosed = exists(`
		select count(*)::int from public.pos_sessions
		where tenant_id=$1 and status='closed'`, tenantID)

	s.JournalEntry = exists(`
		select count(*)::int from public.fin_journal_entries
		where tenant_id=$1 and deleted_at is null`, tenantID)
	s.BankRecon = exists(`
		select count(*)::int from public.fin_bank_statement_lines
		where tenant_id=$1 and matched_payment_id is not null`, tenantID)
	s.FollowUpTask = exists(`select count(*)::int from public.crm_follow_up_tasks where tenant_id=$1`, tenantID)
	s.OperationsWorkspace = exists(`select count(*)::int from public.wm_workspaces where tenant_id=$1`, tenantID)
	s.OperationsWorkItem = exists(`select count(*)::int from public.wm_work_items where tenant_id=$1`, tenantID)
	s.CommsSent = exists(`
		select count(*)::int from public.com_sent_messages
		where tenant_id=$1 and status in ('sent', 'pending')`, tenantID)
	s.RepairOrder = exists(`select count(*)::int from public.inv_repair_orders where tenant_id=$1 and deleted_at is null`, tenantID)
	s.SupportTicket = exists(`select count(*)::int from public.sup_support_tickets where tenant_id=$1`, tenantID)
	s.QualityNCR = exists(`select count(*)::int from public.qms_ncrs where tenant_id=$1`, tenantID)
	s.TeamInvited = count(`
		select count(*)::int from public.users
		where tenant_id=$1 and status='active'`, tenantID) > 1

	return s
}

func nextIncompleteTrackStep(tracks []map[string]any) map[string]any {
	for _, tr := range tracks {
		steps, _ := tr["steps"].([]map[string]any)
		for _, st := range steps {
			done, _ := st["done"].(bool)
			if !done {
				return map[string]any{
					"track_id":    tr["id"],
					"track_title": tr["title"],
					"id":          st["id"],
					"label":       st["label"],
					"href":        st["href"],
				}
			}
		}
	}
	return nil
}
