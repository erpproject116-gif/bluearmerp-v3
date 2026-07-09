package columnlabels

type StandardColumn struct {
	ColumnKey string `json:"column_key"`
	Label     string `json:"label"`
	SortOrder int    `json:"sort_order"`
}

// view_key → default column headers for line grids.
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
	"fin_supplier_invoice.lines": {
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
