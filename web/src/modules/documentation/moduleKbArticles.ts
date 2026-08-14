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
          "Week 4: POS + operations — configure POS, shift, checkout, Operations Hub, CRM, Communications, support.",
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
    id: "document-attachments-workflow",
    title: "Document attachments — add files while filling the form",
    scenario: "Your store requires a file before confirming a quotation, sales order, sale, purchase order, or purchase.",
    intro:
      "When attachment rules are ON (default), you must attach at least one file before confirming. You can pick files while filling out a new document — they upload automatically when you save.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create or open the document and fill in required fields.",
          "Use Upload file in the Attachments section at any time. On a new document, files show as “uploads on save” until you save once.",
          "Save the document. Staged files upload automatically and the record gets its document number.",
          "Change progress to Confirm / Completed / e-Approval only after at least one file is attached — the form will warn you if attachments are missing.",
          "Purchase orders: save in the modal with attachments, then use Confirm on the Purchase Order list.",
        ],
      },
      {
        type: "tip",
        text: "Managers can turn attachment rules off per document type under Settings → Process policies. Attachments on purchase orders are copied forward to Purchases when configured.",
      },
      {
        type: "heading",
        text: "Repair orders",
      },
      {
        type: "steps",
        items: [
          "Save the repair order first, then use the Attachments section on the same form to upload files.",
        ],
      },
    ],
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Process policies (attachment rules)",
    relatedGuideIds: ["process-policies", "load-slip-overview"],
  },
  {
    id: "document-email-workflow",
    title: "Send documents by email (PDF attachment)",
    scenario: "You want to email a quotation, sales order, sale, purchase order, RFQ, or purchase to a customer or vendor with a PDF attached.",
    intro:
      "Use the Email button on saved documents. Messages are logged under Communications → Sent Documents. Configure SMTP on the server (SMTP_HOST, SMTP_FROM) for delivery; optional Gmail connect is under Communications → Settings.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save the document first so it has an ID.",
          "Click Email in the document header (requires Communications → Send permission).",
          "Enter recipient addresses, optional subject and message (or leave blank to use the default template).",
          "Send — a PDF is generated server-side and queued via the transactional outbox.",
          "Review delivery status under /app/comms/sent-documents.",
        ],
      },
      {
        type: "tip",
        text: "Quotation, Sales Order, Sale, Purchase Order, RFQ, and Purchase (supplier invoice) modals show an Email history panel with sent log entries. After connecting Gmail (Communications → Settings), synced thread messages appear there too.",
      },
    ],
    primaryHref: "/app/comms/sent-documents",
    primaryLabel: "Sent document history",
    relatedGuideIds: ["document-attachments-workflow", "load-slip-overview"],
  },
  {
    id: "operations-hub-intro",
    title: "Operations Hub — workspaces, Kanban, and ERP links",
    scenario: "You want monday-style work boards tied to projects, job costing, and ERP documents.",
    intro:
      "Operations Hub lives under Operations in the sidebar. Create a workspace (optionally from an industry pack), manage work items on Kanban or table views, and link items to quotations, POs, and job cost projects.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Operations → Work Hub. Use the workspace selector at the top — your choice is saved for the next visit.",
          "Load a sample project from the empty state, or create a workspace and pick an industry pack (Construction, Retail, Services, and more) to pre-seed columns and starter tasks.",
          "Add work items, assign owners, set due dates, and drag cards across columns on the Kanban board. Switch to table view for sorting and bulk review.",
          "Use Calendar or Timeline tabs for planning views; Dashboard shows job costing budget vs actual when linked to a job cost project.",
          "From a work item, use Create Quotation to start a sales document with project context pre-filled.",
        ],
      },
      {
        type: "tip",
        text: "On demo tenants, populate demo data to load the Riverside Office Renovation workspace (demo-riverside-reno) with sample cards and a linked quotation.",
      },
    ],
    primaryHref: "/app/operations",
    primaryLabel: "Open Operations Hub",
    relatedGuideIds: ["crm-operations-tasks-sync", "onboarding-playbook"],
  },
  {
    id: "crm-operations-tasks-sync",
    title: "CRM follow-up tasks on the Operations board",
    scenario: "You use CRM follow-ups and want the same tasks visible on a project Kanban board.",
    intro:
      "When Operations Hub is enabled, CRM follow-up tasks are mirrored as work items. Updates in either CRM or Operations stay in sync.",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a follow-up task under CRM → Follow-up Tasks as usual.",
          "Open Operations → Work Hub and pick the workspace that holds CRM-linked items.",
          "Drag the mirrored card to change status or column — the CRM task updates too.",
          "Use Operations for team-wide planning; use CRM for salesperson-focused lists and notifications.",
        ],
      },
    ],
    primaryHref: "/app/crm/follow-up-tasks",
    primaryLabel: "Follow-up tasks",
    relatedGuideIds: ["operations-hub-intro", "crm-follow-ups"],
  },
  {
    id: "communications-overview",
    title: "Communications — sent log, inbox, and Gmail",
    scenario: "You want one place to see every document email and optionally sync Gmail threads.",
    intro:
      "Communications records outbound document emails and, when Gmail is connected, shows related threads in Inbox.",
    blocks: [
      {
        type: "steps",
        items: [
          "Send email from any supported document modal (Email button after save).",
          "Open Communications → Sent Documents for delivery status across all document types.",
          "Open Communications → Settings → Connect Gmail to sync inbox threads (admin permission).",
          "Open Communications → Inbox to read synced messages linked to quotations, orders, and invoices.",
        ],
      },
      {
        type: "tip",
        text: "Server SMTP (SMTP_HOST, SMTP_FROM) works without Gmail. Gmail adds two-way thread sync on document modals.",
      },
    ],
    primaryHref: "/app/comms/sent-documents",
    primaryLabel: "Sent Documents",
    relatedGuideIds: ["document-email-workflow"],
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
      {
        type: "tip",
        text: "While you work on selling screens, open Guide in the header to see which step you are on and jump to the next page.",
      },
    ],
    primaryHref: "/app/quotation/quotations/new",
    primaryLabel: "New quotation",
    relatedGuideIds: ["sales", "serial-barcode-scanning"],
  },
  {
    id: "purchase-request-to-ap-flow",
    title: "Purchase Request → PO → Purchase Receive → Payment Made",
    scenario: "You buy stock from a vendor and need inventory and payables tracked.",
    intro:
      "Primary buy path: request (optional), order, Purchase Receive (stock + serials + AP on confirm), then Payment Made. Separate Receive history is legacy.",
    blocks: [
      {
        type: "flow",
        items: ["Purchase Request", "Purchase Order", "Purchase Receive", "Payment Made"],
      },
      {
        type: "steps",
        items: [
          "Create a purchase request (optional Load Slip from sales order demand).",
          "Request vendor quotes (RFQ) or create a purchase order with Load Slip (from Purchase Request or Supplier Quotation).",
          "Open Buy → Purchase Receive. Load Slip from PO (or blank: double-click item), set qty, scan serials until count matches qty, attach DR/vendor SI, confirm.",
          "Confirm posts stock/serials under the hood and syncs the purchase invoice JE / AP.",
          "Pay the vendor with Payment Made under Accounting → Payment Made.",
        ],
      },
      {
        type: "tip",
        text: "On buying screens, open Guide in the header to see the request → pay path and jump to the next step.",
      },
    ],
    primaryHref: "/app/purchases/purchase-receive/new",
    primaryLabel: "Purchase Receive",
    relatedGuideIds: ["serial-barcode-scanning", "load-slip-overview", "rfq-workflow", "purchasing-load-slip-po"],
  },
  {
    id: "goods-receipt-load-slip",
    title: "Load Slip: Bill from Purchase Receive (legacy)",
    scenario: "You already posted Purchase Receive and need to bill the vendor.",
    intro: "Open Purchase Receive lines with remaining billable quantity appear on the Bill Load Slip picker (bill-only; no double stock).",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Buy → Bills → Purchase Receive.",
          "Select the vendor — only their open Purchase Receive lines are offered.",
          "Click Load Slip → Purchase Receive, tick lines, and confirm.",
          "Adjust quantities if you are billing partially, then save the Bill.",
        ],
      },
      {
        type: "tip",
        text: "New businesses default to Bill-first (no Receive required). Turn on “Require Purchase Receive before Bill” only for legacy split UX.",
      },
    ],
    primaryHref: "/app/purchases/purchase-receive/new",
    primaryLabel: "Purchase Receive",
  },
  {
    id: "purchasing-load-slip-po",
    title: "Load Slip: Bill from purchase order (Bill-first)",
    scenario: "You want to bill open PO lines and land stock + serials on confirm.",
    intro:
      "Default for new businesses: Load Slip → Purchase Order (In Progress or Finished with unbilled qty). Confirming the Bill auto-receives stock and serials.",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm the Purchase Order (or leave draft if your process allows open lines).",
          "Open Buy → Purchase Receive and optionally select the vendor.",
          "Choose Load Slip → Purchase Order — use All / In Progress / Finished chips; Finished stays listed when unbilled qty remains.",
          "Set qty first, scan serials until count matches, attach files, then confirm (Completed).",
          "Stock, Serials, and purchase invoice JE / AP update together.",
        ],
      },
      {
        type: "tip",
        text: "If your policy still requires Purchase Receive before Bill, use Load Slip → Purchase Receive, or turn the gate off under Process policies.",
      },
    ],
    primaryHref: "/app/purchases/purchase-receive/new",
    primaryLabel: "Purchase Receive",
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
    primaryHref: "/app/sales/sales/new",
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
    primaryHref: "/app/purchase-order/purchase-orders",
    primaryLabel: "Open purchase orders",
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
          "Or on a new sale with SO lines, use row action **Ship** to create a shipping order for one line.",
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
    relatedGuideIds: ["sales-order-release", "wms-and-shipping", "quotation-to-sales-flow", "sales-shipping-from-line"],
  },
  {
    id: "sales-shipping-from-line",
    title: "Create a shipping order from a sales line",
    scenario: "You want to ship one sales order line without building the whole shipping order manually.",
    intro:
      "On a new sales invoice linked to a sales order, use the row action **Ship** to create a shipping order header and line in one step. Then invoice via Load Slip → Shipping Order.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales → New Sale and pull SO lines (Load Slip → Sales Order) or enter lines linked to an SO.",
          "Set customer, location, and quantity on the line you want to ship.",
          "Click **Ship** on that row — Bluearm creates a shipping order with the SO line qty.",
          "Later, open a new sale and use Load Slip → Shipping Order to invoice shipped qty only.",
        ],
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sale",
    relatedGuideIds: ["sales-load-slip-shipping", "wms-and-shipping"],
  },
  {
    id: "sales-hold-list",
    title: "Sales Hold list (park draft invoices)",
    scenario: "You need to pause a new sales invoice and resume it later — like BluearmERP's Hold list.",
    intro:
      "Hold list stores up to five draft sale payloads per user. Use it only on **new** sales (not when editing an existing invoice).",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Sales → New Sale and fill header and lines.",
          "Click **Hold list** in the footer.",
          "Save to slot 1–5 — customer, amount, and full line grid are stored.",
          "Clear the form or start another sale; return to Hold list and **Load** to restore.",
        ],
      },
      {
        type: "tip",
        text: "Sales Hold parks draft data only. Stock reservation on sales orders still uses SO release / qty_reserved — not the hold slots.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sale",
    relatedGuideIds: ["quotation-to-sales-flow"],
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
          "Open Accounting → Cash & AR/AP → Customer/Vendor Book I (AR) or (AP).",
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
      "Lists posted Purchase Receive lines not yet billed. Bill-first Purchase Receives leave little or no GR residual — use Open POs and Bills for day-to-day outstanding.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Buying → Pre-Invoicing (Purchases) or Buying workspace → Reports.",
          "Set a date range or as-of date, then Search (F8).",
          "For legacy unbilled receives, create Bills with Load Slip → Purchase Receive. Prefer Purchase Receive ← PO for new work.",
        ],
      },
    ],
    primaryHref: "/app/buying/reports/pre-invoicing",
    primaryLabel: "Purchase pre-invoicing",
    relatedGuideIds: ["goods-receipt-load-slip", "purchase-request-to-ap-flow"],
  },
  {
    id: "purchase-cash-payment-after-save",
    title: "Cash Payment and accounting after saving a purchase",
    scenario: "You just created a supplier invoice (purchase) and want to pay the vendor or set up GL immediately.",
    intro:
      "After saving a new purchase, BluearmERP prompts for Cash Payment (payment voucher) or the Invoice tab for accounting — mirroring Cash In on sales.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save a new purchase from Buying → Purchases → New Purchase.",
          "On the post-save dialog, choose Cash Payment to record a payment voucher prefilled with vendor and amount.",
          "Or choose Link accounting voucher to open the Invoice tab — review line breakdown, Acct I/II, and approval.",
          "Enable accounts_auto_post_purchase under Settings → Process policies for automatic GL posting on save.",
        ],
      },
      {
        type: "tip",
        text: "For partial payments, skip the post-save dialog and create a payment voucher under Finance with a lower applied amount.",
      },
    ],
    primaryHref: "/app/finance/supplier-invoices/new",
    primaryLabel: "New purchase",
    relatedGuideIds: ["purchase-request-to-ap-flow", "finance-je-draft-to-post", "sales-cash-in-after-save"],
  },
  {
    id: "bank-reconciliation-weekly",
    title: "Bank reconciliation — match statements to receipts and payments",
    scenario: "You import or enter bank statement lines and need to tie them to official receipts or payment vouchers.",
    intro:
      "Finance → Bank Reconciliation shows unmatched statement lines alongside unmatched OR/PV documents. Select a line on the left, then match a payment on the right.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Finance → Bank Reconciliation.",
          "Filter by bank account if needed; demo data includes statement line DEMO-STMT-OR after seed-demo-finance.sql.",
          "Click an unmatched statement line, then Match on the closest payment amount.",
          "Confirm in the dialog — amounts can differ slightly; investigate large variances before posting.",
        ],
      },
    ],
    primaryHref: "/app/finance/acct-i/bank-reconciliation",
    primaryLabel: "Bank reconciliation",
    relatedGuideIds: ["finance-accounts-overview", "finance-je-draft-to-post"],
  },
  {
    id: "sales-load-slip-so",
    title: "Load Slip: sales invoice from sales order",
    scenario: "You released or delivered a sales order and need to bill the customer.",
    intro:
      "This is the standard path when process policy requires a sales order before invoicing. Load Slip → Sales Order lists confirmed SO lines with open ordered quantity for the selected customer (legacy release mode auto-releases stock when you save the invoice).",
    blocks: [
      {
        type: "steps",
        items: [
          "Confirm the Sales Order (progress Confirmed or Complete).",
          "For serial-tracked items, release stock on Sales Order → Pick List first.",
          "If your store uses split release, post a delivery note before invoicing.",
          "Open Sales → New Sale and optionally select the customer.",
          "Click Load Slip → Sales Order, tick the lines to bill, and confirm.",
          "Review quantities and prices, save as Unconfirmed, upload attachments if required, then Confirm.",
        ],
      },
      {
        type: "tip",
        text: "If Load Slip shows no lines, confirm the SO and clear date/partner filters. See Sales → Pre-Invoicing Status for a backlog view.",
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
      "After saving a new sale, BluearmERP can prompt for Cash In (official receipt) or jump to the Invoice tab for accounting voucher setup. Saving also creates or refreshes a draft sales journal entry when invoice accounts are configured.",
    blocks: [
      {
        type: "steps",
        items: [
          "Save a new sales invoice from Sales → New Sale.",
          "On the post-save dialog, choose Cash In to open the official receipt form prefilled with customer and amount.",
          "Or choose Accounting to open the Invoice tab — review Acct I/II, fees, remark, and the item breakdown table.",
          "Submit or approve the sale if your workflow requires it before posting GL.",
          "Enable accounts_auto_post_sales under Settings → Process policies if invoices should post journals automatically on save.",
        ],
      },
      {
        type: "tip",
        text: "If the journal is already posted, account pickers on the Invoice tab lock — adjust GL under Finance → Journal entries instead.",
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sale",
    relatedGuideIds: ["quotation-to-sales-flow", "finance-accounts-overview", "finance-je-draft-to-post"],
  },
  {
    id: "receivable-payable-status",
    title: "Receivable and Payable Status (as-of reports)",
    scenario: "You need open AR or AP balances at a specific date, not just aging buckets.",
    intro:
      "Receivable Status and Payable Status show customer or vendor balances as-of a date in BluearmERP.",
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
    scenario: "You sell at a retail counter with barcode scanning and need a clear open → sell → close path.",
    intro:
      "Point of Sale runs as an open shift per location. Cashiers use Terminal (/app/pos). Administrators configure catalog and tax under Manage. Checkout creates a sales invoice and reduces stock at the shift location.",
    blocks: [
      {
        type: "heading",
        text: "Open a shift",
      },
      {
        type: "steps",
        items: [
          "Open POS → Terminal (/app/pos).",
          "Confirm the location (stock is deducted from here) and enter opening cash.",
          "Click Open session. You can resume an already-open session for your user/location.",
        ],
      },
      {
        type: "heading",
        text: "Sell and check out",
      },
      {
        type: "steps",
        items: [
          "Scan item codes or tap products on the category grid.",
          "For serial-tracked items, attach exactly one serial per unit before checkout.",
          "Optional: discount, privilege (senior/PWD/student), tip, table/order type, or customer.",
          "Hold a bill if the customer steps away; resume it later from Bills.",
          "Checkout with cash, card, or split tenders. Change is calculated for cash.",
        ],
      },
      {
        type: "heading",
        text: "Close the shift",
      },
      {
        type: "steps",
        items: [
          "Click Close shift and enter counted cash in the drawer.",
          "Review the shift report: sales by tender, expected vs counted cash, and variance.",
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
        text: "When enabled in POS → Manage → Settings, checkout can create the sales invoice journal (DR A/R, CR sales, CR VAT) and an official receipt (DR cash/card, CR A/R). Map default accounts under Chart of Accounts first. Stock still comes from buying (GR) or stock entries — POS does not invent inventory.",
      },
      {
        type: "tip",
        text: "If the network drops, POS may queue actions offline and sync when you are back online. Use Sync now on the amber banner when connected.",
      },
      {
        type: "tip",
        text: "Enable accounts_auto_post_sales and accounts_auto_post_or under Process Policies (or POS Settings auto-post) so journals post immediately.",
      },
    ],
    primaryHref: "/app/pos",
    primaryLabel: "Open POS terminal",
    relatedGuideIds: ["pos-manage-settings", "serial-barcode-scanning", "sales-cash-in-after-save"],
  },
  {
    id: "pos-manage-settings",
    title: "POS Manage: catalog, tax, tenders, and branding",
    scenario: "You need to configure what cashiers see on the register and how tax and payments work.",
    intro:
      "POS Manage (/app/pos/manage) is for administrators with the POS Management permission. Cashiers should use Terminal only. Tabs cover products, categories, modifiers, settings, and logs.",
    blocks: [
      {
        type: "heading",
        text: "Products & categories",
      },
      {
        type: "steps",
        items: [
          "Open POS → Manage.",
          "Products — set sales price, VIP price, category, and whether the item appears on POS.",
          "Categories — build the quick-pick grid cashiers tap during a sale (icons/colors optional).",
        ],
      },
      {
        type: "heading",
        text: "Settings (register behavior)",
      },
      {
        type: "steps",
        items: [
          "Set default location (prefilled when cashiers open a shift).",
          "Choose tax type / rate and whether prices are tax-inclusive.",
          "Enable the tenders and order types your store uses (cash, card, dine-in, takeaway, etc.).",
          "Optional: auto-post sales invoice and official receipt journals on checkout.",
          "Optional: privilege discount percents (senior / PWD / student) and UI labels / theme colors.",
        ],
      },
      {
        type: "heading",
        text: "Modifiers & logs",
      },
      {
        type: "paragraph",
        text: "Modifiers are optional add-ons (size, toppings) linked to products. Logs show recent POS actions for troubleshooting failed checkouts or permission issues.",
      },
      {
        type: "tip",
        text: "After changing catalog or tax, open Terminal and start a test shift with a small sale to confirm prices and stock deduction at the expected location.",
      },
    ],
    primaryHref: "/app/pos/manage",
    primaryLabel: "POS Manage",
    relatedGuideIds: ["pos-checkout-guide", "finance-accounts-overview"],
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
          "Review Chart of accounts under General ledger and post Journal entries for adjustments.",
          "Use Trial balance, Profit & loss, and Balance sheet under Accounting reports.",
          "General ledger and Receivables & payables areas add journals, checks, and aging books.",
        ],
      },
      {
        type: "tip",
        text: "On General ledger or Receivables & payables screens, open Guide in the header for the accounting journey. Receipts and vouchers stay on the Selling / Buying guides.",
      },
    ],
    primaryHref: "/app/finance",
    primaryLabel: "Accounting workspace",
    relatedGuideIds: ["finance-je-draft-to-post", "receivable-payable-status", "chart-of-accounts-ph-template"],
  },
  {
    id: "finance-je-draft-to-post",
    title: "Journal entries: draft → review → post",
    scenario: "You need to understand how sales and purchase invoices create GL and when entries post.",
    intro:
      "Saving invoice accounting on the Invoice tab creates or refreshes a draft journal entry (JE). Posting moves amounts into the GL; auto-post policies skip the manual post step when enabled.",
    blocks: [
      {
        type: "flow",
        items: ["Save invoice accounts", "Draft JE created", "Review lines", "Post (or auto-post)", "TB / statements updated"],
      },
      {
        type: "steps",
        items: [
          "Open a sale or supplier invoice → Invoice tab. Set Acct I (revenue/expense), Acct II (AR/AP), fees, and remark.",
          "Save — the linked JE stays in draft until posted (unless auto-post is on).",
          "Open Finance → Journal entries to review, approve (if policy requires), and post.",
          "Settings → Process policies: accounts_auto_post_sales, accounts_auto_post_purchase, accounts_auto_post_or, accounts_auto_post_pv.",
          "After a JE is posted, invoice account fields lock; use journal entries for corrections.",
        ],
      },
      {
        type: "tip",
        text: "Month-end: open Accounting → Bookkeeping (Books Health) for the live exception queue and checklist, then confirm Trial Balance / P&L / Balance Sheet. See also docs/runbooks/month-close-checklist.md.",
      },
    ],
    primaryHref: "/app/finance/bookkeeping",
    primaryLabel: "Books Health",
    relatedGuideIds: ["sales-cash-in-after-save", "finance-accounts-overview", "process-policies-foundation"],
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
    intro:
      "Repair orders track intake, technician work, parts, and warranty. For defective serials that must stay out of sellable stock, use an RMA-flagged location and Pick from SI — not Sales Return (which restores sellable inventory).",
    blocks: [
      {
        type: "steps",
        items: [
          "Create a repair order under After-Sales → New Repair Order.",
          "Set customer and an RMA-flagged location (lookup shows “(RMA)”).",
          "Use Pick from SI to link the sold serial and sales line, then enable Receive into RMA.",
          "Add parts lines and post consumption when parts are used from stock.",
          "When finished, set Released and choose a non-RMA active location to return the unit to sellable stock.",
          "Print receipt or warranty documents from the repair order actions.",
          "Open History on the list or repair modal to review progress changes, edits, and attachment uploads.",
        ],
      },
      {
        type: "tip",
        text: "Sales Return vs Repair Order: restock/credit → Sales Returns; repair hold / RMA → Repair Order. See Help scenario “Sales Return vs Repair Order (RMA)”.",
      },
    ],
    primaryHref: "/app/after-sales/repair-orders/new",
    primaryLabel: "New repair order",
    relatedGuideIds: ["activity-logs-audit", "sales-return-vs-repair-rma", "sales-return-serial"],
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
    title: "Users, roles, groups, and data scopes (RBAC)",
    scenario: "You administer who can do what in the workspace.",
    intro:
      "Bluearm uses RBAC plus optional data scopes—not full ABAC. Users get a role (job template), optional groups (team add-ons), rare per-user overrides, and optional customer/location scopes.",
    blocks: [
      {
        type: "steps",
        items: [
          "Module & Features — turn on what the company bought.",
          "Roles — default access for a job (Accountant, Warehouse). Prefer roles first.",
          "Groups — optional shared add-ons on top of a role (e.g. Manila sales). Does not replace the role.",
          "Users — invite people, assign role (+ groups), soft-delete/restore, open Overrides only for exceptions.",
          "Data scopes — if the role has Apply user data scopes, limit which customers/locations they see.",
        ],
      },
      {
        type: "tip",
        text: "Invite sends email when SMTP is configured; otherwise the invite stays pending and you ask them to sign in with Google at /signin. Use Resend on a pending invite to re-queue mail. Soft-delete stops access but keeps role, groups, overrides, and scopes for Restore. Use Remove & reset for re-invite (More menu) to clear scopes/overrides/groups, unlink Google, and invite again.",
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
    intro: "Each major document type has a Settings page for standard and custom fields. Store admins can also add custom fields directly on open forms.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open the list screen for the document (e.g. Sales → Sales List → settings gear).",
          "Toggle visibility, required, and disabled flags per field.",
          "Add custom fields (text, select, date, etc.) on the settings page or click + Add custom field on any form that shows the Custom fields section.",
          "Quotation, Sales Order, Sale, Purchase Request, PO, Goods Receipt, and Supplier Invoice support the same pattern.",
        ],
      },
      {
        type: "tip",
        text: "Required custom fields are validated on save. Dropdown and radio fields need at least one choice when you create them.",
      },
    ],
    primaryHref: "/app/sales/sales/settings",
    primaryLabel: "Sales form settings",
    relatedGuideIds: ["inline-custom-fields"],
  },
  {
    id: "inline-custom-fields",
    title: "Add a custom field while filling in a form",
    scenario: "You need a new field on a quotation or item form without opening Settings.",
    intro:
      "Store admins and owners see + Add custom field at the bottom of the Custom fields section on supported forms. The new field appears immediately for everyone after you save it.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open a new or existing document modal (quotation, repair order, item, partner, etc.).",
          "Scroll to Custom fields. Click + Add custom field.",
          "Enter a label, optional field key, field type, and choices (for dropdown or radio).",
          "Click Add field — the field is saved tenant-wide and appears on the form right away.",
        ],
      },
      {
        type: "tip",
        text: "Use Settings → form fields when you need to hide, relabel, or disable standard fields. Inline add is fastest for new custom fields only.",
      },
    ],
    primaryHref: "/app/quotation/quotations/new",
    primaryLabel: "Try on New Quotation",
    relatedGuideIds: ["form-field-settings"],
  },
  {
    id: "serial-lot-registry",
    title: "Serial & Lot: Serials, detail, and manufacturing",
    scenario: "You need to look up a unit or manage lot batches and BOM production.",
    intro: "Serial & Lot is a Stock sub-branch for unit-level inventory, lot batches, movements, receive scanning, and single-level manufacturing.",
    blocks: [
      {
        type: "steps",
        items: [
          "Serials lists every serial unit and its status (in_stock, reserved, sold), unit warranty end, and sold coverage flag.",
          "Open a serial for detail: unit warranty dates, customer coverage after sale, and operational events.",
          "Use the Origin filter (Linked slip vs Manual) to separate receipt-linked units from manual registration.",
          "Lots tracks batch numbers when items use lot tracking instead of individual serials (expiry, not warranty).",
          "Prefer Buy → Purchase Receive to scan new serials; Serial & Lot → Receive is a legacy alternate for open PO lines.",
          "Bills of Material and Work Orders build finished goods and backflush components on completion.",
          "Open History on a Serials or lot-batch row to see who registered, transferred, or adjusted that unit or lot (system audit).",
        ],
      },
      {
        type: "tip",
        text: "Serial detail shows operational events and warranty for one unit. History shows PIC and timestamps from Activity Logs. Use both when qty and serial counts disagree.",
      },
    ],
    primaryHref: "/app/inventory/serial-lot/registry",
    primaryLabel: "Serials",
    relatedGuideIds: ["serial-barcode-scanning", "item-serial-lot-tab", "sales-lot-batch-pick", "activity-logs-audit"],
  },
  {
    id: "item-serial-lot-tab",
    title: "Item master: Serial / Lot tab",
    scenario: "You are setting up an item for serial or lot tracking.",
    intro:
      "Items → edit item → **Serial / Lot** tab. Choose serial or lot tracking (mutually exclusive). Set whether serial/lot capture is **Required** or **Optional** on transactions. After save, open Serials or Lot batches filtered by item.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Inventory → Items and edit or create an item.",
          "Switch to the Serial / Lot tab.",
          "Enable Track serial numbers or Track lot numbers — only one mode per item.",
          "Choose Required on transactions (default) or Optional to allow saving quotes, orders, sales, and GR without serial/lot when not yet known.",
          "Save, then use the links to Serials or Lot batches for that SKU.",
        ],
      },
      {
        type: "tip",
        text: "When policy is Required, the server blocks save/post until serials or a lot batch are captured. Optional still validates counts when you do enter serials or lots.",
      },
    ],
    primaryHref: "/app/inventory/items",
    primaryLabel: "Items",
    relatedGuideIds: ["serial-lot-registry", "sales-lot-batch-pick"],
  },
  {
    id: "sales-lot-batch-pick",
    title: "Pick a lot batch on a sales line",
    scenario: "You sell lot-tracked goods and must specify which batch ships.",
    intro:
      "When an item has lot tracking, the sales line grid shows a lot picker listing available batches at the sale location.",
    blocks: [
      {
        type: "steps",
        items: [
          "Ensure the item has Track lot numbers on the Serial / Lot tab.",
          "On a sales invoice line for that item, open the lot cell and pick a batch.",
          "Save the sale — lot_batch_id is stored on the line and consumed from stock.",
        ],
      },
    ],
    primaryHref: "/app/sales/sales/new",
    primaryLabel: "New sale",
    relatedGuideIds: ["serial-lot-registry", "item-serial-lot-tab"],
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
          "Create a ticket under Support → Tickets with a subject (customer is optional).",
          "Link a warranty asset from CRM when applicable.",
          "Update status and add internal comments as you work.",
          "Assign an agent or link an After-Sales repair order.",
          "Use the floating ticket button from any screen — only Subject is required for quick internal reports.",
        ],
      },
    ],
    primaryHref: "/app/support/tickets",
    primaryLabel: "Support tickets",
    relatedGuideIds: ["crm-follow-ups", "after-sales-repair"],
  },
  {
    id: "migration-center",
    title: "Migration Center — import CSV from other systems",
    scenario: "You are moving partners, items, or chart of accounts from another platform into Bluearm.",
    intro:
      "Migration Center lets you upload CSV files, map foreign column names to Bluearm fields, save mapping profiles for reuse, and import into partners, items, or GL accounts.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open User Management → Migration Center.",
          "Choose Chart of accounts, Customers & suppliers, or Products.",
          "Upload a CSV, map each Bluearm field to a source column (required fields are marked).",
          "Optionally save the mapping as a named profile for the next import.",
          "Run Import, then open the destination list to review created rows.",
        ],
      },
      {
        type: "tip",
        text: "Recommended order: accounts → partners → items. Profiles are per tenant and entity kind, so you can keep separate maps for QuickBooks, Xero, or spreadsheet exports.",
      },
    ],
    primaryHref: "/app/user-management/migration-center",
    primaryLabel: "Migration Center",
    relatedGuideIds: ["setup-wizard", "onboarding-playbook", "chart-of-accounts-ph-template"],
  },
  {
    id: "booking-services",
    title: "Booking — services calendar and convert to quotation",
    scenario: "You schedule service appointments or internal follow-ups and later turn them into quotations.",
    intro:
      "The Booking module manages resources (staff/rooms), priced services, and time-bound bookings. Convert a booking with a customer into a draft quotation in one step.",
    blocks: [
      {
        type: "steps",
        items: [
          "Enable the Booking module under Module & Features if it is not visible.",
          "Open Booking → Bookings. Use the Resources and Services tabs to add capacities and priced services.",
          "Create a booking with title, start/end, customer, resource, and service.",
          "When ready to sell, click Convert to quotation — Bluearm creates a draft quote line from the service.",
          "Open Quotation to confirm pricing, then continue Load Slip into sales order or invoice as usual.",
        ],
      },
      {
        type: "tip",
        text: "Conversion requires a customer on the booking and active tax type + currency. Cancelled bookings cannot convert. A booking can only link to one quotation.",
      },
    ],
    primaryHref: "/app/booking/bookings",
    primaryLabel: "Bookings",
    relatedGuideIds: ["load-slip-overview", "quotation-to-sales-flow"],
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
    primaryHref: "/app/operations/job-costing",
    primaryLabel: "Job costing",
  },
  {
    id: "activity-logs-audit",
    title: "Activity and change logs",
    scenario: "You need to see who changed important records.",
    intro:
      "Activity Logs show user actions across the tenant. Change Logs drill into field-level edits. Per-record History on lists and modals scopes the same audit trail to one partner, item, repair order, serial, sale, or purchase.",
    blocks: [
      {
        type: "steps",
        items: [
          "Open Activity Logs for a chronological tenant-wide audit trail (requires activity-log permission).",
          "Open Change Logs for before/after values on key documents (requires change-log permission).",
          "On Selling, Buying, Finance, Inventory masters, Stock entries/movements, Price lists, After-Sales repairs, and Serials / Lot Batches, click History on a row or the History button in an edit modal.",
          "Per-record History is available to users who can open the document—even without global Activity Log access.",
        ],
      },
      {
        type: "tip",
        text: "Serial detail (Serial & Lot) is operational unit history (receive → issue) plus warranty. History on Serials is the system audit of who registered or adjusted that serial. Use both when investigating stock vs serial mismatches.",
      },
    ],
    primaryHref: "/app/activity-logs",
    primaryLabel: "Activity logs",
    relatedGuideIds: ["inventory-master-data", "after-sales-repair", "serial-lot-registry"],
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
          "Review status for serial GR→SI, lot sales, open PO receive, Operations workspace (demo-riverside-reno), and Communications samples (DEMO-COMMS-* subjects).",
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
    intro: "Stock master data underpins every module — partners, locations, items, projects, departments, bundles, and price lists.",
    blocks: [
      {
        type: "steps",
        items: [
          "Add customers and suppliers under Stock → Partners.",
          "Create items with SKU, prices, and Track serial / Track lot flags as needed.",
          "Maintain selling and buying price lists for automatic rate resolution.",
          "Use Product Bundles to sell kits that explode into component lines.",
          "Open History on any master row (or History in the edit modal) to see who created or changed that record.",
        ],
      },
      {
        type: "tip",
        text: "On Stock screens, open Guide in the header for partners → items → locations → movements. Serial & lot has its own Guide when you open Batch & serial tracking.",
      },
      {
        type: "tip",
        text: "Stock Movements and Stock Entries also expose History so quantity adjustments and transfers stay auditable alongside commercial documents.",
      },
    ],
    primaryHref: "/app/inventory/items",
    primaryLabel: "Items",
    relatedGuideIds: ["setup-wizard", "activity-logs-audit", "serial-lot-registry"],
  },
];
