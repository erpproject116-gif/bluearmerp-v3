import type { KbArticle } from "./documentationTypes";

/** Module and feature guides — merged into knowledgebaseArticles. */
export const moduleKbArticles: KbArticle[] = [
  {
    id: "onboarding-playbook",
    title: "Onboarding playbook (ERP + POS)",
    scenario: "You want a guided path through every module after initial setup.",
    intro:
      "The onboarding playbook tracks progress across foundation, selling, buying, serials, POS, finance, CRM, and dashboard health.",
    blocks: [
      {
        type: "steps",
        items: [
          "Finish required workspace setup at /app/setup.",
          "Open /app/onboarding for the multi-track playbook with auto-detected progress.",
          "Week 1: admin — process policies, modules, Mapping Center, team.",
          "Week 2: selling + serials — quote, SO, pick list, invoice, payment.",
          "Week 3: buying + finance — PR, PO, GR, supplier invoice, GL reports.",
          "Week 4: POS + operations — configure POS, shift, checkout, CRM, support.",
        ],
      },
      {
        type: "tip",
        text: "Use Mark reviewed on review-only steps such as process policies and POS Manage.",
      },
    ],
    primaryHref: "/app/onboarding",
    primaryLabel: "Open onboarding playbook",
    relatedGuideIds: ["setup-wizard", "pos-checkout-guide"],
  },
  {
    id: "sales-order-release",
    title: "Sales orders: pick list, delivery notes, and release modes",
    scenario: "You confirmed a customer order and need to allocate stock before invoicing.",
    intro: "Sales orders sit between quotation and sales invoice. Release (Pick List) reserves or issues stock depending on your process policy.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a sales order from scratch or convert from a quotation.",
          "Open Sales Order → Pick List to enter release quantities per line.",
          "For serial-tracked items, scan or pick serial numbers during release.",
          "In split release mode, post a Delivery Note when goods leave the warehouse.",
          "Invoice from released or delivered lines under Sales → New Sale.",
        ],
      },
      {
        type: "tip",
        text: "Process policies control legacy combined release (stock deducts on release) vs split mode (delivery note issues stock).",
      },
    ],
    primaryHref: "/app/sales-order/sales-orders/release",
    primaryLabel: "Open Pick List",
    relatedGuideIds: ["quotation-to-sales-flow", "serial-barcode-scanning"],
  },
  {
    id: "quotation-to-sales-flow",
    title: "Quotation → Sales Order → Sales invoice",
    scenario: "You want the standard selling chain from quote to cash.",
    intro: "BluearmERP links quotations, sales orders, and sales invoices so quantities and pricing stay aligned.",
    blocks: [
      {
        type: "flow",
        items: ["Quotation", "Sales Order", "Release / Delivery", "Sales Invoice", "Official Receipt"],
      },
      {
        type: "steps",
        items: [
          "Create a quotation under Quotation → New Quotation. Use Load Slip to pull lines from an open quotation when converting.",
          "Convert to a sales order from the quotation list or Mapping Center.",
          "Release stock on the Pick List (Sales Order → Pick List) — scan serials when items track serial numbers.",
          "Create a sales invoice from the sales order (docflow carries reserved serials when configured).",
          "Record customer payment under Accounts → Payment Receipt.",
        ],
      },
    ],
    primaryHref: "/app/quotation/quotations/new",
    primaryLabel: "New quotation",
    relatedGuideIds: ["sales", "serial-barcode-scanning"],
  },
  {
    id: "purchase-request-to-ap-flow",
    title: "Purchase Request → PO → GR → Supplier Invoice",
    scenario: "You buy stock from a vendor and need payables tracked.",
    intro: "The buy-side chain mirrors selling: request, order, receive, then supplier invoice and payment voucher.",
    blocks: [
      {
        type: "flow",
        items: ["Purchase Request", "Purchase Order", "Goods Receipt", "Supplier Invoice", "Payment Voucher"],
      },
      {
        type: "steps",
        items: [
          "Create a purchase request (optional Load Slip from sales order demand).",
          "Create a purchase order and use Load Slip (from Purchase Request) for open PR lines.",
          "Receive goods: create a GR from the PO, scan serials on the GR list or Serial Receive page, then post.",
          "Create a supplier invoice under Buying → Supplier Invoices. Use Load Slip (from Goods Receipt) to pull open GR lines.",
          "Pay the vendor with a payment voucher under Accounts.",
        ],
      },
    ],
    primaryHref: "/app/purchase-request/purchase-requests/new",
    primaryLabel: "New purchase request",
    relatedGuideIds: ["serial-barcode-scanning"],
  },
  {
    id: "goods-receipt-load-slip",
    title: "Load Slip: supplier invoice from goods receipt",
    scenario: "You posted goods receipts and need to bill the vendor.",
    intro: "Open GR lines with remaining billable quantity appear on the supplier invoice Load Slip picker.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounts → Supplier Invoices → New (or Buying → Supplier Invoices).",
          "Select the vendor — only their open GR lines are offered.",
          "Click Load Slip (from Goods Receipt), tick lines, and confirm.",
          "Adjust quantities if you are billing partially, then save the invoice.",
        ],
      },
      {
        type: "tip",
        text: "Process policies can require a posted GR before supplier invoices are allowed.",
      },
    ],
    primaryHref: "/app/purchases/purchases/new",
    primaryLabel: "New supplier invoice",
  },
  {
    id: "pos-checkout-guide",
    title: "POS: checkout, serials, and shift close",
    scenario: "You sell at a retail counter with barcode scanning.",
    intro: "Point of Sale runs in an open session per location. Barcode scans add catalog items; serial-tracked items require a serial scan.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open POS → Terminal. Start or resume a session with opening cash.",
          "Scan item codes to add products. For serial-tracked items, scan the serial number when the item code does not match.",
          "Apply discounts or hold bills if needed. Checkout with cash, card, or split tenders.",
          "At end of shift, close the session and enter counted cash — the shift report shows sales and tenders.",
        ],
      },
      {
        type: "heading",
        text: "Serial rules at POS",
      },
      {
        type: "paragraph",
        text: "Each serial-tracked line must have exactly one serial unit attached before checkout succeeds. The server marks units sold and reduces stock like a sales invoice.",
      },
      {
        type: "heading",
        text: "Accounting on checkout",
      },
      {
        type: "paragraph",
        text: "When enabled in POS → Manage → Settings, checkout automatically creates a sales invoice journal (DR A/R, CR sales, CR VAT) and an official receipt (DR cash/card, CR A/R). Stock still comes from buying (GR) or stock entries — not from POS.",
      },
      {
        type: "tip",
        text: "Configure GL accounts and auto-post under POS → Manage → Settings. Enable accounts_auto_post_sales and accounts_auto_post_or in Process Policies to post journals immediately.",
      },
    ],
    primaryHref: "/app/pos",
    primaryLabel: "Open POS terminal",
    relatedGuideIds: ["serial-barcode-scanning"],
  },
  {
    id: "pos-manage-settings",
    title: "POS Manage: catalog, tax, and hardware",
    scenario: "You need to configure what appears on the POS and how tax is calculated.",
    intro: "POS Manage is for administrators: categories, item catalog, modifiers, default tax type, and barcode scanning.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open POS → Manage (admin permission required).",
          "Set default location, tax type, and whether prices are tax-inclusive.",
          "Enable barcode scanning to accept item_code scans at the terminal.",
          "Assign items to POS categories so they appear on the quick grid.",
        ],
      },
    ],
    primaryHref: "/app/pos/manage",
    primaryLabel: "POS Manage",
  },
  {
    id: "finance-accounts-overview",
    title: "Accounts: receipts, purchases, and GL",
    scenario: "You handle customer receipts, vendor payments, and accounting reports.",
    intro: "The Accounts module covers AR (official receipts), AP (payment vouchers), chart of accounts, journals, and financial statements.",
    blocks: [
      {
        type: "steps",
        items: [
          "Customer payments: Official Receipts apply cash to sales invoices.",
          "Vendor payments: Payment Vouchers apply cash to supplier invoices.",
          "Review Chart of Accounts and post Journal Entries for adjustments.",
          "Use Trial Balance, P&L, and Balance Sheet under finance reports.",
          "Acct. I and Acct. II sub-modules add journal workflows and check register.",
        ],
      },
    ],
    primaryHref: "/app/finance",
    primaryLabel: "Finance workspace",
  },
  {
    id: "crm-follow-ups",
    title: "CRM: leads, pipeline, and follow-ups",
    scenario: "You track prospects and customer follow-up tasks.",
    intro: "CRM connects to quotations and sales with alerts, leads, opportunities, and warranty assets.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open CRM → Dashboard for alerts and KPIs.",
          "Manage leads and opportunities; link quotations to pipeline stages.",
          "Assign follow-up tasks and use notification bell for due items.",
          "Configure alert rules under CRM → Alert Rules (managers).",
        ],
      },
    ],
    primaryHref: "/app/crm/dashboard",
    primaryLabel: "CRM dashboard",
  },
  {
    id: "after-sales-repair",
    title: "After-Sales: repair orders",
    scenario: "You service products returned by customers.",
    intro: "Repair orders track intake, technician work, parts consumption, and warranty.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a repair order under After-Sales → New Repair Order.",
          "Set customer, location, and progress status.",
          "Add parts lines and post consumption when parts are used from stock.",
          "Print receipt or warranty documents from the repair order actions.",
        ],
      },
    ],
    primaryHref: "/app/after-sales/repair-orders/new",
    primaryLabel: "New repair order",
  },
  {
    id: "wms-and-shipping",
    title: "WMS and shipping (sales orders)",
    scenario: "You fulfill orders with warehouse picks and outbound shipping.",
    intro: "Shipping orders, rules, and delivery trips integrate with sales order release and delivery notes.",
    blocks: [
      {
        type: "steps",
        items: [
          "Release stock on Sales Order → Pick List.",
          "Create delivery notes for shipped quantities.",
          "Use Sales Order → Shipping for shipping orders, rules, and trips when the shipping module is enabled.",
          "WMS features (pick waves, putaway) live under the WMS sub-branch when licensed.",
        ],
      },
    ],
    primaryHref: "/app/sales-order/sales-orders/release",
    primaryLabel: "Pick List",
  },
  {
    id: "quality-ncr-capa",
    title: "Quality: NCRs and CAPA",
    scenario: "You document non-conformances and corrective actions.",
    intro: "Quality tracks NCRs linked to goods receipts or manufacturing, and CAPA workflows for resolution.",
    blocks: [
      {
        type: "steps",
        items: [
          "Record an NCR under Quality → NCRs when inspection fails.",
          "Link to affected GR or items; set disposition.",
          "Open CAPA under Quality → CAPA for root-cause and preventive actions.",
        ],
      },
    ],
    primaryHref: "/app/quality/ncrs",
    primaryLabel: "NCR list",
  },
  {
    id: "user-management-admin",
    title: "Users, roles, and process policies",
    scenario: "You administer who can do what in the workspace.",
    intro: "User Management covers users, roles, groups, permissions, process policies, and mapping center.",
    blocks: [
      {
        type: "steps",
        items: [
          "Invite users under User Management → Users.",
          "Assign roles or fine-tune permissions per user.",
          "Set process policies: quotation before SO, GR before supplier invoice, SO release mode, etc.",
          "Use Mapping Center for document conversion rules between modules.",
        ],
      },
    ],
    primaryHref: "/app/user-management/users",
    primaryLabel: "Manage users",
    relatedGuideIds: ["setup-wizard"],
  },
  {
    id: "reports-and-dashboard",
    title: "Dashboard, reports, and reconciliation",
    scenario: "You monitor business health and fix data gaps.",
    intro: "The Business Dashboard and Stock workspace surface KPIs and reconciliation warnings.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Dashboard for sales, stock, and finance alerts.",
          "Stock → Stock Reconciliation lists serial qty mismatches, GR gaps, SO release gaps, and more.",
          "Report Catalogue (/app/reports) runs saved analytics across modules.",
        ],
      },
      {
        type: "tip",
        text: "Amber banners on Stock workspace summarize open reconciliation counts — click through to fix issues.",
      },
    ],
    primaryHref: "/app/dashboard",
    primaryLabel: "Business dashboard",
  },
  {
    id: "hr-payroll-basics",
    title: "HR & Payroll basics",
    scenario: "You maintain employees and run payroll.",
    intro: "HR module stores employee master data and payroll run headers.",
    blocks: [
      {
        type: "steps",
        items: [
          "Add employees under HR → Employees.",
          "Create payroll runs under HR → Payroll Runs when payroll is in scope for your tenant.",
        ],
      },
    ],
    primaryHref: "/app/hr/employees",
    primaryLabel: "Employees",
  },
  {
    id: "fixed-assets-register",
    title: "Fixed assets register",
    scenario: "You track depreciable assets.",
    intro: "Fixed Assets maintains an asset register with categories and depreciation schedules.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Fixed Assets → Asset Register.",
          "Add assets with acquisition date, cost, and depreciation method.",
        ],
      },
    ],
    primaryHref: "/app/fixed-assets",
    primaryLabel: "Asset register",
  },
  {
    id: "collective-invoicing",
    title: "Group (collective) invoicing",
    scenario: "You bill multiple sales orders or deliveries on one invoice.",
    intro: "Collective invoicing groups lines from open sales documents into a single invoice run.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales → Group Invoicing sub-branch.",
          "Build a collective invoice batch from eligible sales or delivery lines.",
          "Post and print the collective invoice; individual sales links remain traceable.",
        ],
      },
    ],
    primaryHref: "/app/sales/collective-invoicing/list",
    primaryLabel: "Collective invoice list",
  },
  {
    id: "form-field-settings",
    title: "Customize form fields per document",
    scenario: "You want to hide, require, or relabel fields on transaction screens.",
    intro: "Each major document type has a Settings page for standard and custom fields.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open the list screen for the document (e.g. Sales → Sales List → settings gear).",
          "Toggle visibility, required, and disabled flags per field.",
          "Add custom fields (text, select, date, etc.) where enabled.",
          "Purchase Request, PO, Goods Receipt, and Supplier Invoice now support the same pattern as Sales.",
        ],
      },
    ],
    primaryHref: "/app/sales/sales/settings",
    primaryLabel: "Sales form settings",
  },
  {
    id: "serial-lot-registry",
    title: "Serial & Lot: registry, trace, and manufacturing",
    scenario: "You need to look up a unit or manage lot batches and BOM production.",
    intro: "Serial & Lot is a Stock sub-branch for unit-level inventory, lot batches, movements, receive scanning, and single-level manufacturing.",
    blocks: [
      {
        type: "steps",
        items: [
          "Registry lists every serial unit and its status (in_stock, reserved, sold).",
          "Trace searches one serial number across receive, release, and sale events.",
          "Lots tracks batch numbers when items use lot tracking instead of individual serials.",
          "Receive (under Serial & Lot) is an alternate path to scan serials against open PO lines.",
          "Bills of Material and Work Orders build finished goods and backflush components on completion.",
        ],
      },
    ],
    primaryHref: "/app/inventory/serial-lot/registry",
    primaryLabel: "Serial registry",
    relatedGuideIds: ["serial-barcode-scanning"],
  },
  {
    id: "wms-scheduled-receipts",
    title: "WMS: scheduled inbound receipts",
    scenario: "You plan dock appointments and compare expected vs actual receipts.",
    intro: "WMS (when enabled under Module & Features) schedules inbound against purchase order lines before goods receipt posts.",
    blocks: [
      {
        type: "steps",
        items: [
          "Enable WMS under User Management → Module & Features.",
          "Open Stock → WMS → Scheduled Receipts.",
          "Create schedules linked to PO lines and expected arrival dates.",
          "Compare scheduled quantities to posted goods receipts.",
        ],
      },
    ],
    primaryHref: "/app/inventory/wms/scheduled-receipts",
    primaryLabel: "Scheduled receipts",
  },
  {
    id: "data-center-ingestion",
    title: "Data Center: file ingestion",
    scenario: "You import partner, item, or transaction rows from spreadsheets.",
    intro: "Data Center maps external files through ingestion rules into staging before posting to live lists.",
    blocks: [
      {
        type: "steps",
        items: [
          "Enable Data Center under Module & Features.",
          "Define ingestion rules with column mappings.",
          "Upload files to the Inbox and review staged rows.",
          "Post validated rows into inventory or finance modules.",
        ],
      },
    ],
    primaryHref: "/app/data-center/inbox",
    primaryLabel: "Data Center inbox",
  },
  {
    id: "support-tickets",
    title: "Support tickets",
    scenario: "A customer reports a problem after the sale.",
    intro: "Support tickets track issues, link warranty assets, and can connect to repair orders.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a ticket under Support → Tickets with customer and subject.",
          "Link a warranty asset from CRM when applicable.",
          "Update status and add internal comments as you work.",
          "Assign an agent or link an After-Sales repair order.",
        ],
      },
    ],
    primaryHref: "/app/support/tickets",
    primaryLabel: "Support tickets",
    relatedGuideIds: ["crm-follow-ups", "after-sales-repair"],
  },
  {
    id: "customer-portal",
    title: "Customer portal (read-only)",
    scenario: "Customers should view their orders and invoices without ERP access.",
    intro: "The portal is a separate sign-in. Administrators invite portal users tied to a customer partner.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a portal user for the customer partner (admin action).",
          "Customer opens the portal login and requests a magic link.",
          "They browse orders, invoices, and tickets scoped to their account only.",
        ],
      },
      {
        type: "tip",
        text: "Portal users cannot access internal modules or other customers' data.",
      },
    ],
    primaryHref: "/portal/login",
    primaryLabel: "Portal login",
  },
  {
    id: "tax-and-currency",
    title: "Tax types and currency",
    scenario: "You need VAT or multi-currency on quotations and orders.",
    intro: "Tax Management under Quotation configures tax types and currencies used on selling documents.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Quotation → Taxes (Tax Management sub-branch).",
          "Maintain Tax Types (inclusive vs exclusive VAT).",
          "Set default currency and exchange rates under Currencies.",
          "New quotations and sales orders pick up these defaults.",
        ],
      },
    ],
    primaryHref: "/app/quotation/tax-mngt/tax-types",
    primaryLabel: "Tax types",
  },
  {
    id: "approvals-queue",
    title: "Document approvals",
    scenario: "A purchase request or sales order needs manager sign-off.",
    intro: "When process policies require approval, documents enter e-Approval until authorized users act from the queue.",
    blocks: [
      {
        type: "steps",
        items: [
          "Submit the document (PR, SO, PO, or collective invoice) when policy requires it.",
          "Approvers open Dashboard → Approvals or their notification bell.",
          "Approve to unlock the next document type, or reject with a reason.",
        ],
      },
    ],
    primaryHref: "/app/dashboard/approvals",
    primaryLabel: "Approvals queue",
    relatedGuideIds: ["user-management-admin"],
  },
  {
    id: "manufacturing-bom",
    title: "Manufacturing: BOM and work orders",
    scenario: "You assemble finished goods from components in-house.",
    intro: "Single-level bills of material and work orders live under Stock → Serial & Lot → Manufacturing.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a BOM with one finished item and component quantities.",
          "Create a work order from the BOM and set quantity to produce.",
          "Release the work order when production starts.",
          "Complete the work order to backflush components and receive finished goods.",
        ],
      },
    ],
    primaryHref: "/app/inventory/serial-lot/manufacturing/boms",
    primaryLabel: "Bills of material",
  },
  {
    id: "job-costing-projects",
    title: "Job costing",
    scenario: "You track project budgets and labor against jobs.",
    intro: "Job Costing is separate from Inventory → Projects. It compares budget lines to timesheet actuals.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a job cost project with budget lines.",
          "Enter timesheets against the job.",
          "Review budget vs actual variance reports.",
        ],
      },
    ],
    primaryHref: "/app/job-costing",
    primaryLabel: "Job costing",
  },
  {
    id: "activity-logs-audit",
    title: "Activity and change logs",
    scenario: "You need to see who changed important records.",
    intro: "Activity Logs show user actions; Change Logs drill into field-level edits on key documents.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Activity Logs for a chronological audit trail.",
          "Open Change Logs for before/after values on transactions.",
          "Use History on individual document modals for record-specific timelines.",
        ],
      },
    ],
    primaryHref: "/app/activity-logs",
    primaryLabel: "Activity logs",
  },
  {
    id: "demo-data-training",
    title: "Demo data for training",
    scenario: "You are on a demo tenant and want sample documents without manual entry.",
    intro: "Demo Data populates or purges transactional samples on DEMO000 / BLUEARM workspaces.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open User Management → Demo Data (admin on demo tenant).",
          "Purge demo data to reset transactions while keeping master data.",
          "Populate with purge-first for a clean golden scenario set.",
          "Review status for serial GR→SI, lot sales, and open PO receive checks.",
        ],
      },
    ],
    primaryHref: "/app/user-management/demo-data",
    primaryLabel: "Demo data",
  },
  {
    id: "inventory-master-data",
    title: "Partners, items, and price lists",
    scenario: "You are setting up customers, products, and selling prices.",
    intro: "Stock master data underpins every module — partners, locations, items, bundles, and price lists.",
    blocks: [
      {
        type: "steps",
        items: [
          "Add customers and suppliers under Stock → Partners.",
          "Create items with SKU, prices, and Track serial / Track lot flags as needed.",
          "Maintain selling and buying price lists for automatic rate resolution.",
          "Use Product Bundles to sell kits that explode into component lines.",
        ],
      },
    ],
    primaryHref: "/app/inventory/items",
    primaryLabel: "Items",
    relatedGuideIds: ["setup-wizard"],
  },
];
