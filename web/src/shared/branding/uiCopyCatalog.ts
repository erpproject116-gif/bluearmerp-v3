export type UiCopyEntry = { key: string; label: string; fallback: string };

export type UiCopyGroup = {
  id: string;
  title: string;
  description?: string;
  entries: UiCopyEntry[];
};

/** Tenant-editable screen copy grouped for Branding settings. */
export const UI_COPY_GROUPS: UiCopyGroup[] = [
  {
    id: "common",
    title: "Common",
    description: "Shared list grids, toolbars, and status messages.",
    entries: [
      { key: "common.loading", label: "Loading message", fallback: "Loading…" },
      { key: "common.updating", label: "Updating indicator", fallback: "Updating…" },
      { key: "common.search", label: "Search filter label", fallback: "Search" },
      { key: "common.status", label: "Status filter label", fallback: "Status" },
      { key: "common.status_active", label: "Status: Active", fallback: "Active" },
      { key: "common.status_inactive", label: "Status: Inactive", fallback: "Inactive" },
      { key: "common.status_all", label: "Status: All", fallback: "All" },
      { key: "common.refresh", label: "Refresh button", fallback: "Refresh" },
      { key: "common.new_row", label: "New row button", fallback: "+ New row" },
      { key: "common.no_rows", label: "Empty grid", fallback: "No rows yet. Press F2 to create one." },
      { key: "common.no_results", label: "No search results", fallback: "No results" },
      { key: "common.previous", label: "Pagination: Previous", fallback: "Previous" },
      { key: "common.next", label: "Pagination: Next", fallback: "Next" },
      { key: "common.import_csv", label: "Import CSV button", fallback: "Import CSV" },
      { key: "common.importing", label: "Importing indicator", fallback: "Importing…" },
      { key: "common.download_template", label: "Download template", fallback: "Download template" },
      { key: "common.attachments", label: "Attachments section", fallback: "Attachments" },
    ],
  },
  {
    id: "lines",
    title: "Line items",
    description: "Document line grids in selling and purchasing modals.",
    entries: [
      { key: "lines.heading", label: "Section heading", fallback: "Line items" },
      { key: "lines.add_button", label: "Add line button", fallback: "+ Line" },
      { key: "lines.add_row", label: "Add row button (repair grid)", fallback: "+ Add row" },
      {
        key: "lines.tax_hint",
        label: "Tax type required hint",
        fallback: "Select a transaction type to apply tax rates to line amounts.",
      },
      { key: "lines.item_search_hint", label: "Item field hint", fallback: "Double-click to search items" },
      { key: "lines.partner_search_hint", label: "Partner field hint", fallback: "Double-click to search partner" },
    ],
  },
  {
    id: "selling",
    title: "Selling",
    entries: [
      {
        key: "selling.attachments_quotation",
        label: "Quotation attachments",
        fallback: "Attachments (carried to Sales Order & Sales)",
      },
      {
        key: "selling.attachments_sales_order",
        label: "Sales order attachments",
        fallback: "Attachments (carried from Quotation, on to Sales)",
      },
      {
        key: "selling.attachments_sales",
        label: "Sales attachments",
        fallback: "Attachments (carried from Quotation/Sales Order)",
      },
    ],
  },
  {
    id: "purchasing",
    title: "Purchasing",
    entries: [
      {
        key: "purchasing.attachments_po",
        label: "Purchase order attachments",
        fallback: "Attachments (carried to Purchases)",
      },
      {
        key: "purchasing.attachments_invoice",
        label: "Supplier invoice attachments",
        fallback: "Attachments (carried from Purchase Order / Purchase Receive)",
      },
    ],
  },
  {
    id: "form_settings",
    title: "Form settings",
    entries: [
      { key: "form_settings.breadcrumb_suffix", label: "Breadcrumb suffix", fallback: "Form settings" },
      { key: "form_settings.page_title_suffix", label: "Page title suffix", fallback: "settings" },
      {
        key: "form_settings.description",
        label: "Page description",
        fallback:
          "Form fields control the create/edit modal. List columns control the data table. Line columns control the modal line grid.",
      },
      { key: "form_settings.save_fields", label: "Save form fields button", fallback: "Save form fields" },
      { key: "form_settings.save_line_columns", label: "Save line columns button", fallback: "Save line columns" },
      { key: "form_settings.save_list_columns", label: "Save list columns button", fallback: "Save list columns" },
      {
        key: "form_settings.form_fields_heading",
        label: "Form fields section",
        fallback: "Form fields (create/edit modal)",
      },
      {
        key: "form_settings.form_fields_description",
        label: "Form fields section description",
        fallback: "Visibility here hides fields on the new/edit form only — not on the list table.",
      },
      {
        key: "form_settings.line_column_heading",
        label: "Line column section",
        fallback: "Line grid columns (modal lines)",
      },
      {
        key: "form_settings.line_column_description",
        label: "Line column section description",
        fallback: "Customize headers shown in the line items grid inside the create/edit modal.",
      },
      {
        key: "form_settings.list_column_heading",
        label: "List column section",
        fallback: "List columns (data table)",
      },
      {
        key: "form_settings.list_column_description",
        label: "List column section description",
        fallback:
          "Labels and default visibility for the list/data table. Users can further hide columns with the Columns picker on the list.",
      },
      { key: "form_settings.add_custom_field", label: "Add custom field section", fallback: "Add custom field" },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    entries: [
      { key: "reports.search_button", label: "Search button", fallback: "Search (F8)" },
      { key: "reports.reset_button", label: "Reset button", fallback: "Reset" },
      { key: "reports.date_from", label: "Date from label", fallback: "From" },
      { key: "reports.date_to", label: "Date to label", fallback: "To" },
      { key: "reports.export_csv", label: "Export CSV", fallback: "Export CSV" },
      { key: "reports.no_filter_match", label: "No rows match filters", fallback: "No rows match your filters." },
      { key: "reports.generated_prefix", label: "Generated prefix", fallback: "Generated" },
      { key: "reports.prev_page", label: "Previous page", fallback: "Prev" },
      { key: "reports.next_page", label: "Next page", fallback: "Next" },
    ],
  },
  {
    id: "operations",
    title: "Project management",
    entries: [
      { key: "operations.loading_widgets", label: "Dashboard loading", fallback: "Loading widgets…" },
      {
        key: "operations.no_widgets",
        label: "Empty dashboard",
        fallback: "No dashboard widgets yet. Create a workspace with the Construction industry pack.",
      },
    ],
  },
  {
    id: "print",
    title: "Print layouts",
    description: "Section headings and labels on document print previews.",
    entries: [
      { key: "print.loading", label: "Print loading", fallback: "Loading…" },
      { key: "print.quotation_details", label: "Quotation details section", fallback: "Quotation Details" },
      { key: "print.customer", label: "Customer section", fallback: "Customer" },
      { key: "print.payment_terms", label: "Payment terms section", fallback: "Payment Terms" },
      { key: "print.notes", label: "Notes section", fallback: "Notes" },
      { key: "print.subtotal", label: "Subtotal label", fallback: "Subtotal" },
      { key: "print.tax", label: "Tax label", fallback: "Tax" },
      { key: "print.grand_total", label: "Grand total label", fallback: "Grand Total" },
      { key: "print.pretax_amount", label: "Pretax amount label", fallback: "Pretax amount" },
      { key: "print.accounting_voucher", label: "Accounting voucher section", fallback: "Accounting voucher" },
      { key: "print.prepared_by", label: "Signature: prepared by", fallback: "Prepared by" },
      { key: "print.customer_acceptance", label: "Signature: customer acceptance", fallback: "Customer Acceptance" },
    ],
  },
  {
    id: "goods_receipt",
    title: "Purchase Receive",
    entries: [
      { key: "goods_receipt.list_title", label: "List page title", fallback: "Purchase Receive" },
      { key: "goods_receipt.list_description", label: "List page description", fallback: "Record stock in from purchase orders and attach delivery proof." },
      { key: "goods_receipt.receive_goods", label: "New Purchase Receive button", fallback: "New Purchase Receive" },
      { key: "goods_receipt.scan_serials", label: "Scan serials panel title", fallback: "Scan serials" },
      { key: "goods_receipt.open_in_receive", label: "Open in receive link", fallback: "Open in Purchase Receive" },
      { key: "goods_receipt.draft_only_scans", label: "Draft-only scans message", fallback: "Only draft receipts accept serial scans." },
      { key: "goods_receipt.receive_page_title", label: "Receive page title", fallback: "Purchase Receive / Scan Serials" },
      { key: "goods_receipt.lot_entry", label: "Lot entry section", fallback: "Lot entry" },
      { key: "goods_receipt.pre_post_review", label: "Pre-post review section", fallback: "Pre-post review (serials)" },
    ],
  },
  {
    id: "session",
    title: "Session / security",
    entries: [
      { key: "session.idle_warning_title", label: "Idle warning title", fallback: "Still there?" },
      {
        key: "session.idle_warning_body",
        label: "Idle warning message",
        fallback: "You have been inactive. You will be signed out in about 2 minutes unless you continue.",
      },
      { key: "session.stay_signed_in", label: "Stay signed in button", fallback: "Stay signed in" },
      { key: "session.sign_out_now", label: "Sign out now button", fallback: "Sign out now" },
    ],
  },
];

const fallbackByKey = new Map(
  UI_COPY_GROUPS.flatMap((g) => g.entries.map((e) => [e.key, e.fallback] as const)),
);

export function uiCopyFallback(key: string): string | undefined {
  return fallbackByKey.get(key);
}
