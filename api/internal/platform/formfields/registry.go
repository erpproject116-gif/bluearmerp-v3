package formfields

type StandardField struct {
	FieldKey        string `json:"field_key"`
	Label           string `json:"label"`
	FieldType       string `json:"field_type"`
	DefaultRequired bool   `json:"default_required"`
	DefaultDisabled bool   `json:"default_disabled"`
	SortOrder       int    `json:"sort_order"`
}

var standardRegistry = map[string][]StandardField{
	"inv_partner": {
		{FieldKey: "partner_kind", Label: "Kind", FieldType: "select", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "company_name", Label: "Company name", FieldType: "text", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "ceo_name", Label: "CEO name", FieldType: "text", SortOrder: 30},
		{FieldKey: "phone", Label: "Phone", FieldType: "text", SortOrder: 40},
		{FieldKey: "mobile", Label: "Mobile", FieldType: "text", SortOrder: 50},
		{FieldKey: "email", Label: "Email", FieldType: "text", SortOrder: 60},
		{FieldKey: "address", Label: "Address", FieldType: "textarea", SortOrder: 70},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 80},
	},
	"inv_location": {
		{FieldKey: "location_name", Label: "Location name", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "location_type", Label: "Type", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "production_process", Label: "Production process", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 40},
	},
	"inv_project": {
		{FieldKey: "project_name", Label: "Project name", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 20},
	},
	"inv_department": {
		{FieldKey: "department_name", Label: "Department name", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 20},
	},
	"inv_item": {
		{FieldKey: "item_name", Label: "Item name", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "purchase_price", Label: "Purchase price", FieldType: "number", SortOrder: 20},
		{FieldKey: "sales_price", Label: "Sales price", FieldType: "number", SortOrder: 30},
		{FieldKey: "vip_price", Label: "VIP price", FieldType: "number", SortOrder: 40},
		{FieldKey: "warranty_duration_months", Label: "Warranty (months)", FieldType: "number", SortOrder: 45},
		{FieldKey: "reorder_level", Label: "Reorder level", FieldType: "number", SortOrder: 46},
		{FieldKey: "track_inventory_qty", Label: "Track inventory quantity", FieldType: "checkbox", SortOrder: 47},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 50},
	},
	"inv_repair_order": {
		{FieldKey: "order_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 30},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "progress_status", Label: "Progress status", FieldType: "select", SortOrder: 50},
		{FieldKey: "scheduled_completion_date", Label: "Scheduled completion date", FieldType: "date", SortOrder: 60},
		{FieldKey: "latest_update", Label: "Latest update", FieldType: "textarea", SortOrder: 70},
		{FieldKey: "repair_details", Label: "Repair details", FieldType: "textarea", SortOrder: 80},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 90},
		{FieldKey: "project_name", Label: "Project name", FieldType: "text", SortOrder: 100},
		{FieldKey: "technician_name", Label: "Technician", FieldType: "text", SortOrder: 110},
	},
	"quo_tax_type": {
		{FieldKey: "name", Label: "Name", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "tax_mode", Label: "Tax mode", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "rate_percent", Label: "Rate %", FieldType: "number", SortOrder: 30},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 40},
	},
	"quo_currency": {
		{FieldKey: "currency_code", Label: "Code", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "name", Label: "Name", FieldType: "text", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "symbol", Label: "Currency sign", FieldType: "text", DefaultRequired: true, SortOrder: 25},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 30},
	},
	"sa_sales": {
		{FieldKey: "order_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "due_date", Label: "Due date", FieldType: "date", SortOrder: 15},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 60},
		{FieldKey: "si_dr_no", Label: "SI/DR No.", FieldType: "text", SortOrder: 70},
		{FieldKey: "payment_terms", Label: "Payment terms", FieldType: "text", SortOrder: 80},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 90},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 100},
		{FieldKey: "progress_status", Label: "Progress status", FieldType: "select", SortOrder: 110},
	},
	"so_sales_order": {
		{FieldKey: "order_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "due_date", Label: "Due date", FieldType: "date", SortOrder: 15},
		{FieldKey: "delivery_date", Label: "Delivery date", FieldType: "date", SortOrder: 20},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "location_id", Label: "Location-Out", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 60},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 70},
		{FieldKey: "reference", Label: "Reference", FieldType: "text", SortOrder: 80},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 90},
		{FieldKey: "delivery_remarks", Label: "Delivery remarks", FieldType: "textarea", SortOrder: 100},
		{FieldKey: "payment_terms", Label: "Payment terms", FieldType: "text", SortOrder: 110},
		{FieldKey: "mop", Label: "MOP", FieldType: "text", SortOrder: 120},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 130},
		{FieldKey: "progress_status", Label: "Progress status", FieldType: "select", SortOrder: 140},
	},
	"fin_official_receipt": {
		{FieldKey: "receipt_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "payment_method", Label: "Payment method", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "reference_no", Label: "Reference no.", FieldType: "text", SortOrder: 50},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 60},
	},
	"quo_quotation": {
		{FieldKey: "order_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "location_id", Label: "Location-Out", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 60},
		{FieldKey: "quotation_validity_text", Label: "Quotation validity", FieldType: "text", SortOrder: 70},
		{FieldKey: "payment_terms", Label: "Payment terms", FieldType: "text", SortOrder: 80},
		{FieldKey: "note_for_pic_only", Label: "Note for PIC only", FieldType: "textarea", SortOrder: 90},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 100},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 110},
		{FieldKey: "progress_status", Label: "Progress status", FieldType: "select", SortOrder: 120},
	},
	"pr_purchase_request": {
		{FieldKey: "request_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Supplier", FieldType: "select", SortOrder: 20},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 60},
		{FieldKey: "reference_no", Label: "Reference", FieldType: "text", SortOrder: 70},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 80},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 90},
	},
	"po_purchase_order": {
		{FieldKey: "order_date", Label: "Date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Vendor / Supplier", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 60},
		{FieldKey: "reference", Label: "Reference", FieldType: "text", SortOrder: 70},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 80},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 90},
	},
	"gr_goods_receipt": {
		{FieldKey: "receipt_date", Label: "Receipt date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "reference", Label: "Reference", FieldType: "text", SortOrder: 30},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 40},
	},
	"fin_supplier_invoice": {
		{FieldKey: "invoice_date", Label: "Invoice date", FieldType: "date", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "partner_id", Label: "Vendor", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "tax_type_id", Label: "Transaction type", FieldType: "select", DefaultRequired: true, SortOrder: 25},
		{FieldKey: "currency_id", Label: "Currency", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "location_id", Label: "Location", FieldType: "select", DefaultRequired: true, SortOrder: 35},
		{FieldKey: "pic_name", Label: "PIC", FieldType: "text", SortOrder: 36},
		{FieldKey: "progress_status", Label: "Progress status", FieldType: "select", SortOrder: 37},
		{FieldKey: "due_date", Label: "Due date", FieldType: "date", SortOrder: 38},
		{FieldKey: "payment_terms", Label: "Payment terms", FieldType: "text", SortOrder: 39},
		{FieldKey: "vendor_invoice_no", Label: "Vendor invoice no.", FieldType: "text", SortOrder: 40},
		{FieldKey: "reference", Label: "Reference", FieldType: "text", SortOrder: 45},
		{FieldKey: "project_id", Label: "Project", FieldType: "select", SortOrder: 48},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 50},
	},
	"ops_work_item": {
		{FieldKey: "title", Label: "Title", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "column_id", Label: "Column", FieldType: "select", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 30},
		{FieldKey: "priority", Label: "Priority", FieldType: "select", DefaultRequired: true, SortOrder: 40},
		{FieldKey: "partner_id", Label: "Customer", FieldType: "select", SortOrder: 50},
		{FieldKey: "start_date", Label: "Start date", FieldType: "date", SortOrder: 60},
		{FieldKey: "end_date", Label: "End date", FieldType: "date", SortOrder: 70},
		{FieldKey: "description", Label: "Description", FieldType: "textarea", SortOrder: 80},
	},
	"hr_employee": {
		{FieldKey: "employee_no", Label: "Employee #", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "full_name", Label: "Full name", FieldType: "text", DefaultRequired: true, SortOrder: 20},
		{FieldKey: "department_id", Label: "Department", FieldType: "select", SortOrder: 30},
		{FieldKey: "job_title", Label: "Job title", FieldType: "text", SortOrder: 40},
		{FieldKey: "hire_date", Label: "Hire date", FieldType: "date", DefaultRequired: true, SortOrder: 50},
		{FieldKey: "status", Label: "Status", FieldType: "select", DefaultRequired: true, SortOrder: 60},
		{FieldKey: "base_salary", Label: "Base salary", FieldType: "number", SortOrder: 70},
		{FieldKey: "user_id", Label: "ESS login user", FieldType: "select", SortOrder: 80},
		{FieldKey: "email", Label: "Email", FieldType: "text", SortOrder: 90},
		{FieldKey: "bank_name", Label: "Bank name", FieldType: "text", SortOrder: 100},
		{FieldKey: "bank_account_no", Label: "Bank account no.", FieldType: "text", SortOrder: 110},
		{FieldKey: "tin", Label: "TIN", FieldType: "text", SortOrder: 120},
		{FieldKey: "sss_no", Label: "SSS no.", FieldType: "text", SortOrder: 130},
		{FieldKey: "philhealth_no", Label: "PhilHealth no.", FieldType: "text", SortOrder: 140},
		{FieldKey: "pagibig_no", Label: "Pag-IBIG no.", FieldType: "text", SortOrder: 150},
		{FieldKey: "tax_status", Label: "Tax status", FieldType: "select", SortOrder: 160},
		{FieldKey: "notes", Label: "Notes", FieldType: "textarea", SortOrder: 170},
	},
	"cms_page": {
		{FieldKey: "title", Label: "Title", FieldType: "text", DefaultRequired: true, SortOrder: 10},
		{FieldKey: "slug", Label: "Slug", FieldType: "text", SortOrder: 20},
		{FieldKey: "body", Label: "Body", FieldType: "textarea", SortOrder: 30},
		{FieldKey: "seo_title", Label: "SEO title", FieldType: "text", SortOrder: 40},
		{FieldKey: "seo_description", Label: "SEO description", FieldType: "textarea", SortOrder: 50},
		{FieldKey: "featured_media_id", Label: "Featured image", FieldType: "select", SortOrder: 60},
		{FieldKey: "status", Label: "Status", FieldType: "select", SortOrder: 70},
	},
}

func StandardFields(entityType string) []StandardField {
	fields := standardRegistry[entityType]
	if fields == nil {
		return []StandardField{}
	}
	out := make([]StandardField, len(fields))
	copy(out, fields)
	return out
}

func ValidEntityType(entityType string) bool {
	_, ok := standardRegistry[entityType]
	return ok
}
