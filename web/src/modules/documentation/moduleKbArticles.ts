import type { KbArticle } from "./documentationTypes";

/** Module and feature guides — merged into knowledgebaseArticles. */
export const moduleKbArticles: KbArticle[] = [
  {
    id: "onboarding-playbook",
    title: "Onboarding playbook (ERP + POS)",
    scenario: "You want a guided path through every module after initial setup.",
    intro:
      "The onboarding playbook tracks progress across foundation, selling, buying, serials, POS, finance, CRM, and dashboard health. Steps auto-complete when you create real documents. Each step links to a Knowledge base article when you need more detail.",
    blocks: [
      {
        type: "steps",
        items: [
          "Finish required workspace setup at /app/setup (confirm seeds + partners + products).",
          "Open /app/onboarding — the Dashboard also shows a Start here checklist until foundation is done.",
          "Week 1: admin — process policies (including attachment rules), modules, Mapping Center, team.",
          "Week 2: selling — quote, SO, pick list, delivery note, invoice (Load Slip), official receipt.",
          "Week 3: buying + finance — PR, RFQ, PO, GR, supplier invoice, pre-invoicing report, payment voucher.",
          "Week 4: POS + operations — configure POS, shift, checkout, CRM, support.",
        ],
      },
      {
        type: "tip",
        text: "Click How to — step-by-step guide under any playbook step for plain-language instructions. Use Mark reviewed on review-only steps such as process policies and reports.",
      },
    ],
    primaryHref: "/app/onboarding",
    primaryLabel: "Open onboarding playbook",
    relatedGuideIds: ["setup-wizard", "first-week", "process-policies"],
  },
  {
    id: "load-slip-overview",
    title: "What is Load Slip? (copy lines between documents)",
    scenario: "You want to avoid retyping items when moving from one document to the next.",
    intro:
      "Load Slip is a menu on many New document screens. It lists open lines from an earlier step (for example a sales order or goods receipt) and copies quantity, item, and price into your current form.",
    blocks: [
      {
        type: "heading",
        text: "Selling — sales invoice",
      },
      {
        type: "steps",
        items: [
          "Sales Order — invoice released or deliverable SO lines.",
          "Quotation — invoice open quote lines without creating an SO first.",
          "Shipping Order — invoice SO lines already on an outbound shipping order.",
        ],
      },
      {
        type: "heading",
        text: "Selling — sales order",
      },
      {
        type: "steps",
        items: ["Quotation — copy open quotation lines onto a new sales order."],
      },
      {
        type: "heading",
        text: "Buying — purchase order",
      },
      {
        type: "steps",
        items: [
          "Purchase Request — copy approved PR lines with balance quantity.",
          "Supplier Quotation (RFQ) — copy accepted vendor quote lines not yet on a PO.",
        ],
      },
      {
        type: "heading",
        text: "Buying — purchase request",
      },
      {
        type: "steps",
        items: ["Sales Order — copy open SO lines to plan what stock to buy (demand)."],
      },
      {
        type: "heading",
        text: "Buying — supplier invoice",
      },
      {
        type: "steps",
        items: [
          "Goods Receipt — bill posted GR lines (most common when GR is required).",
          "Purchase Order — bill open PO balance without GR when policy allows.",
          "Supplier Quotation (RFQ) — same as PO load slip but grouped by vendor quote number.",
        ],
      },
      {
        type: "tip",
        text: "Select the customer or vendor on the form first — Load Slip only shows lines for that partner. Save as Unconfirmed, upload attachments if your store requires them, then Confirm.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "Try Load Slip on New Sale",
    relatedGuideIds: ["sales", "purchase-request", "process-policies"],
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
          "Create a quotation under Quotation → New Quotation. On sales orders use Load Slip → Quotation for open quote lines.",
          "Convert to a sales order from the quotation list or Mapping Center, or use Load Slip on New Sales Order.",
          "Release stock on the Pick List (Sales Order → Pick List) — scan serials when items track serial numbers.",
          "Create a sales invoice from the sales order (Load Slip → Sales Order) or directly from quotation when policy allows.",
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
          "Request vendor quotes (RFQ) or create a purchase order with Load Slip (from Purchase Request or Supplier Quotation).",
          "Receive goods: create a GR from the PO, scan serials on the GR list or Serial Receive page, then post.",
          "Create a supplier invoice under Buying → Supplier Invoices. Use Load Slip (from Goods Receipt) to pull open GR lines, or PO / RFQ when GR is not required.",
          "Pay the vendor with a payment voucher under Accounts.",
        ],
      },
    ],
    primaryHref: "/app/purchase-request/purchase-requests/new",
    primaryLabel: "New purchase request",
    relatedGuideIds: ["serial-barcode-scanning", "load-slip-overview", "rfq-workflow"],
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
    id: "purchasing-load-slip-po",
    title: "Load Slip: supplier invoice from purchase order",
    scenario: "You want to bill open PO lines without posting a goods receipt first.",
    intro:
      "When process policy allows, open PO lines with residual quantity can be pulled directly onto a supplier invoice for the same vendor.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Buying → New Purchase (or Accounts → Supplier Invoices → New).",
          "Select the vendor — Load Slip lists open PO lines for that partner.",
          "Choose Load Slip → Purchase Order, tick lines, and apply residual qty.",
          "Save the supplier invoice; billed qty updates on the PO line.",
        ],
      },
      {
        type: "tip",
        text: "If your policy requires GR before supplier invoice, use Load Slip (from Goods Receipt) instead.",
      },
    ],
    primaryHref: "/app/purchases/purchases/new",
    primaryLabel: "New supplier invoice",
    relatedGuideIds: ["goods-receipt-load-slip", "purchase-request-to-ap-flow"],
  },
  {
    id: "sales-load-slip-quotation",
    title: "Load Slip: sales invoice from quotation",
    scenario: "You want to invoice open quotation lines without creating a sales order first.",
    intro:
      "On a new sales invoice, Load Slip → Quotation lists open quotation lines. Selected lines populate the invoice header and line grid with residual quantities.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Selling → Sales → New Sales (or your sales template).",
          "Select the customer, then click Load Slip → Quotation.",
          "Tick lines and confirm — customer, location, tax type, currency, and lines are filled in.",
          "Review pricing, save as Unconfirmed, upload attachments if required, then complete.",
        ],
      },
      {
        type: "tip",
        text: "For full quote-to-cash tracking (reservations, delivery, quotation balance), convert the quotation to a sales order first, then invoice from the SO using Load Slip → Sales Order.",
      },
    ],
    primaryHref: "/app/selling/sales/new",
    primaryLabel: "New sales invoice",
    relatedGuideIds: ["quotation-to-sales-flow", "sales-order-release"],
  },
  {
    id: "purchase-order-load-slip-pr",
    title: "Load Slip: purchase order from purchase request",
    scenario: "Approved purchase requests have open lines you want to order from a vendor.",
    intro: "On a new purchase order, Load Slip → Purchase Request lists PR lines with balance quantity.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Purchase Request → Purchase Orders → New.",
          "Select the vendor (when lines include a vendor), then click Load Slip → Purchase Request.",
          "Tick PR lines and confirm — tax type, currency, location, and lines populate the PO.",
          "Save the draft PO, attach files if required, then Confirm on the list.",
        ],
      },
    ],
    primaryHref: "/app/purchase-request/purchase-orders/new",
    primaryLabel: "New purchase order",
    relatedGuideIds: ["purchase-request-to-ap-flow"],
  },
  {
    id: "purchase-order-load-slip-rfq",
    title: "Load Slip: purchase order from supplier quotation (RFQ)",
    scenario: "A vendor submitted an accepted quote and you want to order without retyping lines.",
    intro: "On a new purchase order, Load Slip → Supplier Quotation lists accepted RFQ quote lines with balance quantity not yet on a PO.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create an RFQ and record supplier quotations under Purchase Order → RFQ.",
          "Accept the winning vendor quote, then open Purchase Order → New.",
          "Click Load Slip → Supplier Quotation, tick lines, and confirm.",
          "Save the PO, attach files if required, then Confirm.",
        ],
      },
      {
        type: "tip",
        text: "You can also convert an entire accepted quotation to a PO from the RFQ detail screen.",
      },
    ],
    primaryHref: "/app/purchase-order/rfq",
    primaryLabel: "RFQ list",
    relatedGuideIds: ["purchase-request-to-ap-flow", "supplier-invoice-load-slip-rfq"],
  },
  {
    id: "supplier-invoice-load-slip-rfq",
    title: "Load Slip: supplier invoice from RFQ-sourced PO lines",
    scenario: "You ordered from an accepted vendor quote and need to bill open PO balance grouped by quote.",
    intro:
      "On a supplier invoice, Load Slip → Supplier Quotation lists open purchase order lines that trace back to an accepted supplier quotation — same residual qty as Load Slip → Purchase Order, with quote context.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Accounts → Supplier Invoices → New and select the vendor.",
          "Click Load Slip → Supplier Quotation (RFQ).",
          "Tick lines (quote no. and PO no. are shown), then apply residual qty.",
          "If process policy requires goods receipt first, use Load Slip → Goods Receipt instead.",
        ],
      },
    ],
    primaryHref: "/app/finance/supplier-invoices/new",
    primaryLabel: "New supplier invoice",
    relatedGuideIds: ["goods-receipt-load-slip", "purchasing-load-slip-po", "purchase-order-load-slip-rfq"],
  },
  {
    id: "sales-load-slip-shipping",
    title: "Load Slip: sales invoice from shipping order",
    scenario: "You shipped sales order lines on a shipping order and want to invoice them.",
    intro:
      "Load Slip → Shipping Order on a new sales invoice lists SO lines linked to non-cancelled shipping orders with invoiceable balance.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create shipping orders under Sales Order → Shipping and link them to sales orders.",
          "Open Sales → New Sale, select the customer, then Load Slip → Shipping Order.",
          "Tick lines and confirm — header and line grid populate from the linked SO.",
          "Save, upload attachments if required, then confirm the invoice.",
        ],
      },
      {
        type: "tip",
        text: "For full SO release and delivery tracking, prefer Load Slip → Sales Order when lines are released but not yet on a shipping order.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sales invoice",
    relatedGuideIds: ["sales-order-release", "wms-and-shipping", "quotation-to-sales-flow"],
  },
  {
    id: "customer-vendor-book-report",
    title: "Customer/Vendor Book I (AR and AP)",
    scenario: "You need a slip-level ledger of receivables or payables for a date range.",
    intro:
      "Customer/Vendor Book I shows debits and credits by slip: AR lists sales (debit) and official receipts (credit); AP lists supplier invoices (credit) and payment vouchers (debit). Running balance is computed in date order.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Finance → Acct. II → Customer/Vendor Book I (AR) or (AP).",
          "Set date from / date to and optional partner ID, then Search (F8).",
          "Export CSV with Excel when results are displayed.",
        ],
      },
    ],
    primaryHref: "/app/finance/reports/customer-vendor-book-ar",
    primaryLabel: "Customer/Vendor Book (AR)",
    relatedGuideIds: ["receivable-payable-status", "finance-accounts-overview"],
  },
  {
    id: "purchase-pre-invoicing-report",
    title: "Pre-Invoicing Status (Purchases)",
    scenario: "Goods were received but not yet on a supplier invoice.",
    intro:
      "This report lists posted goods receipt lines with balance quantity and amount not yet billed — the buy-side mirror of Sales → Pre-Invoicing Status.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Buying → Pre-Invoicing (Purchases) or Buying workspace → Reports.",
          "Set a date range or as-of date, then Search (F8).",
          "Create supplier invoices from open lines using Load Slip → Goods Receipt.",
        ],
      },
    ],
    primaryHref: "/app/buying/reports/pre-invoicing",
    primaryLabel: "Purchase pre-invoicing",
    relatedGuideIds: ["goods-receipt-load-slip", "purchase-request-to-ap-flow"],
  },
  {
    id: "sales-load-slip-so",
    title: "Load Slip: sales invoice from sales order",
    scenario: "You released or delivered a sales order and need to bill the customer.",
    intro:
      "This is the standard path when process policy requires a sales order before invoicing. Load Slip → Sales Order lists open SO lines with invoiceable balance for the selected customer.",
    blocks: [
      {
        type: "steps",
        items: [
          "Release stock on Sales Order → Pick List (and post a delivery note if your store uses split release).",
          "Open Sales → New Sale and select the customer.",
          "Click Load Slip → Sales Order, tick the lines to bill, and confirm.",
          "Review quantities and prices, save as Unconfirmed, upload attachments if required, then Confirm.",
        ],
      },
      {
        type: "tip",
        text: "If Load Slip shows no lines, check that the SO is confirmed and enough quantity was released or delivered. See Sales → Pre-Invoicing Status for a backlog view.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sales invoice",
    relatedGuideIds: ["sales-order-release", "sales-pre-invoicing-report", "load-slip-overview"],
  },
  {
    id: "sales-order-load-slip-quotation",
    title: "Load Slip: sales order from quotation",
    scenario: "The customer accepted your quote and you want a sales order without retyping lines.",
    intro: "On New Sales Order, Load Slip → Quotation lists open quotation lines with balance quantity.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales Order → New Sales Order.",
          "Select the customer, then click Load Slip → Quotation.",
          "Tick quote lines and confirm — lines, tax type, and pricing copy to the order.",
          "Save, attach supporting files if required, then Confirm the sales order.",
        ],
      },
      {
        type: "tip",
        text: "You can also convert from the quotation list or Mapping Center. Load Slip is fastest when you already have the order form open.",
      },
    ],
    primaryHref: "/app/sales-order/sales-orders/new",
    primaryLabel: "New sales order",
    relatedGuideIds: ["quotation-to-sales-flow", "sales-load-slip-quotation"],
  },
  {
    id: "purchase-request-load-slip-so",
    title: "Load Slip: purchase request from sales order demand",
    scenario: "You need to buy stock to fulfill customer orders.",
    intro:
      "On a new purchase request, Load Slip (from Sales Order) copies open SO lines so purchasing can see what customers are waiting for.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Purchase Request → New Purchase Request.",
          "Click Load Slip (from Sales Order) above the line grid.",
          "Tick SO lines and confirm — items and quantities populate the PR.",
          "Assign vendors per line if needed, save, and submit for approval when required.",
        ],
      },
    ],
    primaryHref: "/app/purchase-request/purchase-requests/new",
    primaryLabel: "New purchase request",
    relatedGuideIds: ["purchase-request-to-ap-flow", "quotation-to-sales-flow"],
  },
  {
    id: "rfq-workflow",
    title: "RFQ: request quotes and order from a supplier",
    scenario: "You want competitive pricing before placing a purchase order.",
    intro:
      "Request for Quotation (RFQ) lets you ask one or more vendors for prices, record their supplier quotations, accept the winner, then create a PO.",
    blocks: [
      {
        type: "flow",
        items: ["Purchase Request (optional)", "RFQ", "Supplier quotations", "Accept quote", "Purchase Order", "Goods Receipt"],
      },
      {
        type: "steps",
        items: [
          "Open Purchase Order → RFQ and create a request linked to a purchase request when applicable.",
          "Add supplier quotations with line items and prices for each vendor.",
          "Accept the winning quotation.",
          "Create a PO from the RFQ detail screen, or use Load Slip → Supplier Quotation on New Purchase Order.",
          "Receive goods and bill the vendor per your process policy.",
        ],
      },
    ],
    primaryHref: "/app/purchase-order/rfq",
    primaryLabel: "Open RFQ list",
    relatedGuideIds: ["purchase-order-load-slip-rfq", "purchase-request-to-ap-flow"],
  },
  {
    id: "sales-pre-invoicing-report",
    title: "Pre-Invoicing Status (Sales)",
    scenario: "You want to see which delivered or released orders are not yet invoiced.",
    intro:
      "Sales → Pre-Invoicing Status lists sales order lines with balance not yet on a sales invoice — use it before month-end billing.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales → Pre-Invoicing Status.",
          "Set filters and press Search (F8).",
          "Open Sales → New Sale and use Load Slip → Sales Order to bill the listed lines.",
        ],
      },
    ],
    primaryHref: "/app/sales/sales/pre-invoicing",
    primaryLabel: "Sales pre-invoicing",
    relatedGuideIds: ["sales-load-slip-so", "purchase-pre-invoicing-report"],
  },
  {
    id: "sales-cash-in-after-save",
    title: "Cash In and accounting after saving a sales invoice",
    scenario: "You just created a sales invoice and want to record payment or GL immediately.",
    intro:
      "After saving a new sale, BluearmERP can prompt for Cash In (official receipt) or jump to the Invoice tab for accounting voucher setup.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save a new sales invoice from Sales → New Sale.",
          "On the post-save dialog, choose Cash In to open the receipt form prefilled with customer and amount.",
          "Or choose Accounting to open the Invoice tab and configure auto-post sales / AR journal when enabled.",
          "Enable accounts_auto_post_sales under Process Policies if checkout should post GL automatically.",
        ],
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sale",
    relatedGuideIds: ["quotation-to-sales-flow", "finance-accounts-overview"],
  },
  {
    id: "receivable-payable-status",
    title: "Receivable and Payable Status (as-of reports)",
    scenario: "You need open AR or AP balances at a specific date, not just aging buckets.",
    intro:
      "Receivable Status and Payable Status mirror ECount E040721/E040722 — customer or vendor balances as-of a date.",
    blocks: [
      {
        type: "steps",
        items: [
          "Selling → Reports → Receivable Status for open customer balances.",
          "Buying → Reports → Payable Status for open vendor balances.",
          "Set the as-of date and search; export CSV from the report toolbar.",
          "For combined AR/AP position, use Finance → AR/AP Status.",
        ],
      },
    ],
    primaryHref: "/app/selling/reports/receivable-status",
    primaryLabel: "Receivable Status",
    relatedGuideIds: ["finance-accounts-overview", "reports-and-dashboard"],
  },
  {
    id: "acct-vs-inventory-reconciliation",
    title: "Accounting vs Inventory reconciliation",
    scenario: "You want GL inventory accounts to match stock valuation.",
    intro:
      "The Acct vs Inventory report compares posted GL balances for inventory-related accounts against stock on-hand valuation at an as-of date.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Finance → Reports → Accounting vs Inventory.",
          "Pick as-of date and run the report.",
          "Investigate variances using Stock Reconciliation and journal entries.",
        ],
      },
      {
        type: "tip",
        text: "Ensure goods receipts and sales postings are complete before month-end reconciliation.",
      },
    ],
    primaryHref: "/app/finance/reports/acct-inventory-reconciliation",
    primaryLabel: "Acct vs Inventory",
    relatedGuideIds: ["reports-and-dashboard"],
  },
  {
    id: "stock-reconciliation-walkthrough",
    title: "Fix stock reconciliation red flags",
    scenario: "Dashboard or Stock workspace shows serial, GR, or SO release gaps.",
    intro:
      "Stock Reconciliation groups common data-health issues so you can drill into the underlying documents.",
    blocks: [
      {
        type: "flow",
        items: [
          "Open reconciliation list",
          "Pick issue category",
          "Open source document",
          "Post correction",
        ],
      },
      {
        type: "steps",
        items: [
          "Open Stock → Stock Reconciliation (or follow a red flag link from the Dashboard).",
          "Review categories: serial qty mismatch, GR without supplier invoice, SO release without delivery, etc.",
          "Open the linked document and post the missing step (invoice, delivery note, or adjustment).",
        ],
      },
    ],
    primaryHref: "/app/inventory/stock-reconciliation",
    primaryLabel: "Stock reconciliation",
    relatedGuideIds: ["reports-and-dashboard", "serial-barcode-scanning"],
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
          "On a sales invoice, Load Slip → Shipping Order pulls SO lines linked to outbound shipping orders with invoiceable balance.",
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
          "Set process policies: quotation before SO, GR before supplier invoice, SO release mode, required attachments, etc.",
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
          "Open Dashboard for sales, stock, and finance alerts — Start here checklist until setup is complete.",
          "Selling → Receivable Status and Buying → Payable Status for as-of AR/AP.",
          "Sales → Pre-Invoicing and Buying → Pre-Invoicing (Purchases) for unbilled backlog.",
          "Finance → Customer/Vendor Book I (AR/AP) for slip-level ledgers.",
          "Finance → Accounting vs Inventory for GL vs stock valuation.",
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
    intro:
      "New workspaces are seeded with PHP and standard VAT types. Confirm them during setup, then maintain tax types and currencies under Quotation → Tax Management.",
    blocks: [
      {
        type: "steps",
        items: [
          "During /app/setup/currency-tax, open Tax Types, review seeded codes, then Confirm.",
          "Open Quotation → Taxes (Tax Management sub-branch) for ongoing maintenance.",
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
