package columnlabels

type StandardColumn struct {
	ColumnKey string `json:"column_key"`
	Label     string `json:"label"`
	SortOrder int    `json:"sort_order"`
	// DefaultHidden hides the column until a tenant explicitly enables it in settings.
	DefaultHidden bool `json:"-"`
}

// view_key → default column headers for line grids and list tables.
var standardRegistry = map[string][]StandardColumn{
	"quo_quotation.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_price", Label: "Unit Price", SortOrder: 70},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 80},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 90},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 100},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 110},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 120},
		{ColumnKey: "serials", Label: "Planned Serials", SortOrder: 130},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 140},
	},
	"sa_sales.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 70},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 80},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 90},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 100},
		{ColumnKey: "discount_amount", Label: "Discount", SortOrder: 110},
		{ColumnKey: "serials", Label: "Serial / Lot", SortOrder: 120},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 130},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 140},
	},
	"so_sales_order.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 70},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 80},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 90},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 100},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 110},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 120},
	},
	"pr_purchase_request.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 70},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 80},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 90},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 100},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 110},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 120},
	},
	"po_purchase_order.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "spec_name", Label: "Spec Name", SortOrder: 35},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "unit", Label: "UoM", SortOrder: 55},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_price", Label: "Unit Price", SortOrder: 65},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 70},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 80},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 90},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 100},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 110},
		{ColumnKey: "warranty", Label: "Warranty", SortOrder: 115, DefaultHidden: true},
		{ColumnKey: "serials", Label: "Serials", SortOrder: 118},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 120},
	},
	"fin_supplier_invoice.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "spec_name", Label: "Spec Name", SortOrder: 35},
		{ColumnKey: "description", Label: "Description", SortOrder: 40},
		{ColumnKey: "qty", Label: "Qty", SortOrder: 50},
		{ColumnKey: "unit", Label: "UoM", SortOrder: 55},
		{ColumnKey: "basis", Label: "Basis", SortOrder: 60},
		{ColumnKey: "unit_price", Label: "Unit Price", SortOrder: 65},
		{ColumnKey: "unit_non_vat", Label: "Unit (Non-VAT)", SortOrder: 70},
		{ColumnKey: "non_vat_total", Label: "Non-VAT Total", SortOrder: 80},
		{ColumnKey: "tax", Label: "Tax", SortOrder: 90},
		{ColumnKey: "unit_vat_inc", Label: "Unit (VAT inc.)", SortOrder: 100},
		{ColumnKey: "line_total", Label: "Line Total", SortOrder: 110},
		{ColumnKey: "warranty", Label: "Warranty", SortOrder: 115, DefaultHidden: true},
		{ColumnKey: "serials", Label: "Serials", SortOrder: 118},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 120},
	},
	"fin_supplier_invoice.list": {
		{ColumnKey: "date_no_display", Label: "Date-No.", SortOrder: 10},
		{ColumnKey: "vendor_invoice_no", Label: "SI/DR No. (Tracking No.)", SortOrder: 20},
		{ColumnKey: "po_numbers", Label: "PO Number", SortOrder: 30},
		{ColumnKey: "notes", Label: "Notes", SortOrder: 40},
		{ColumnKey: "payment_terms", Label: "Payment Terms", SortOrder: 50},
		{ColumnKey: "tax_type_name", Label: "Transaction Type Name", SortOrder: 60},
		{ColumnKey: "vendor_name", Label: "Customer/Vendor Name", SortOrder: 70},
		{ColumnKey: "item_name_summary", Label: "Item Name (Summary)", SortOrder: 80},
		{ColumnKey: "grand_total", Label: "Total Amount", SortOrder: 90},
		{ColumnKey: "progress_status", Label: "Progress Status", SortOrder: 100},
		{ColumnKey: "invoicing_status", Label: "Invoicing Status", SortOrder: 110},
		{ColumnKey: "print", Label: "Print", SortOrder: 120},
		{ColumnKey: "created_by_name", Label: "Creator", SortOrder: 130},
		{ColumnKey: "pic_name", Label: "PIC Name", SortOrder: 140},
		{ColumnKey: "history", Label: "History", SortOrder: 150},
		{ColumnKey: "lifecycle", Label: "Manage", SortOrder: 160},
	},
	"inv_stock_adjustment.list": {
		{ColumnKey: "created_at", Label: "When", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item name", SortOrder: 30},
		{ColumnKey: "location_name", Label: "Location / branch", SortOrder: 40},
		{ColumnKey: "qty_before", Label: "Qty from", SortOrder: 50},
		{ColumnKey: "qty_delta", Label: "Change", SortOrder: 60},
		{ColumnKey: "qty_after", Label: "Qty to", SortOrder: 70},
		{ColumnKey: "status", Label: "Status", SortOrder: 80},
		{ColumnKey: "reason", Label: "Reason", SortOrder: 90},
		{ColumnKey: "created_by_name", Label: "Submitted by", SortOrder: 100},
		{ColumnKey: "decided_by_name", Label: "Approved / rejected by", SortOrder: 110},
		{ColumnKey: "decided_at", Label: "Decided at", SortOrder: 120},
		{ColumnKey: "actions", Label: "Actions", SortOrder: 130},
	},
	"inv_stock_movement.list": {
		{ColumnKey: "created_at", Label: "When", SortOrder: 10},
		{ColumnKey: "item_code", Label: "Item Code", SortOrder: 20},
		{ColumnKey: "item_name", Label: "Item Name", SortOrder: 30},
		{ColumnKey: "location_name", Label: "Location", SortOrder: 40},
		{ColumnKey: "qty_delta", Label: "Qty Δ", SortOrder: 50},
		{ColumnKey: "movement_type", Label: "Type", SortOrder: 60},
		{ColumnKey: "reason", Label: "Reason", SortOrder: 70},
		{ColumnKey: "history", Label: "History", SortOrder: 80},
	},
	"inv_stock_entry.lines": {
		{ColumnKey: "line_no", Label: "#", SortOrder: 10},
		{ColumnKey: "item", Label: "Item", SortOrder: 20},
		{ColumnKey: "qty_out", Label: "Quantity out", SortOrder: 30},
		{ColumnKey: "qty_in", Label: "Quantity in", SortOrder: 40},
		{ColumnKey: "serial_lot", Label: "Serial / lot", SortOrder: 50},
		{ColumnKey: "count", Label: "Count", SortOrder: 60},
		{ColumnKey: "remark", Label: "Remark", SortOrder: 70},
	},
	"inv_stock_entry.list": {
		{ColumnKey: "datetime", Label: "Datetime", SortOrder: 10},
		{ColumnKey: "entry_no", Label: "TR No", SortOrder: 20},
		{ColumnKey: "item_code", Label: "Item", SortOrder: 30},
		{ColumnKey: "from_location_name", Label: "Location out", SortOrder: 40},
		{ColumnKey: "qty_out", Label: "Qty out", SortOrder: 50},
		{ColumnKey: "to_location_name", Label: "Location in", SortOrder: 60},
		{ColumnKey: "qty_in", Label: "Qty in", SortOrder: 70},
		{ColumnKey: "serial_lot_count", Label: "Serial/Lot", SortOrder: 80},
		{ColumnKey: "transferred_by_name", Label: "Transferred by", SortOrder: 90},
		{ColumnKey: "reason", Label: "Reason", SortOrder: 100},
		{ColumnKey: "status", Label: "Status", SortOrder: 110},
		{ColumnKey: "actions", Label: "Actions", SortOrder: 120},
	},
}

func StandardColumns(viewKey string) []StandardColumn {
	cols := standardRegistry[viewKey]
	if cols == nil {
		return []StandardColumn{}
	}
	out := make([]StandardColumn, len(cols))
	copy(out, cols)
	return out
}

func ValidViewKey(viewKey string) bool {
	_, ok := standardRegistry[viewKey]
	return ok
}

func LineViewKeyForEntity(entityType string) string {
	return entityType + ".lines"
}
