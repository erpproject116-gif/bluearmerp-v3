package inventory

// Serial registration slip types (ECount C000690 — 21 document types).
var validSerialSlipTypes = map[string]string{
	"quotation":                  "Quotation",
	"sales_order":                "Sales Order",
	"sales":                      "Sales",
	"shipping_order":             "Shipping Order",
	"shipping":                   "Shipping",
	"purchase_order":             "Purchase Order",
	"purchases":                  "Purchases",
	"goods_receipt":              "Goods Receipt",
	"consumed":                   "Consumed",
	"repair_order":               "Repair Order",
	"repair":                     "Repair",
	"location_tran":              "Location Tran.",
	"goods_issued":               "Goods Issued",
	"internal_use":               "Internal Use",
	"defect_disassemble_defect":  "Defect-Disassemble (Defect Item)",
	"defect_disassemble_normal":  "Defect-Disassemble (Normal Item)",
	"defect_usable":              "Defect-Usable",
	"defect_dispose":             "Defect-Dispose",
	"create_quality_insp_request": "Create Quality Insp. Request",
	"quality_inspection":         "Quality Inspection",
	"invoice_packing_list":       "Invoice/Packing List",
}

func isValidSerialSlipType(slipType string) bool {
	_, ok := validSerialSlipTypes[slipType]
	return ok
}
