/**
 * Plain-language, start-to-finish workflow guides. The header Guide button
 * resolves the matching journey from the current URL via resolveWorkflowForPath.
 * Written for non-technical users: every step says what you do, in what order,
 * and where to click next.
 */

import type { MeData } from "./auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "./moduleAccess";

export type WorkflowStep = {
  id: string;
  /** Short label for the step chip, e.g. "Quotation". */
  short: string;
  /** Full step title, e.g. "Give the customer a price (Quotation)". */
  title: string;
  /** 1–2 plain sentences: what you do here and what happens after. */
  what: string;
  /** Page to open for this step. */
  href: string;
  /** Route prefixes that mean "the user is currently on this step". */
  routePrefixes?: string[];
  /** Step can be skipped in the flow — shown with an "Optional" badge. */
  optional?: boolean;
  /** Hide step when this tenant module is disabled. */
  moduleCode?: string;
  /** Hide step when this tenant feature is disabled. */
  featureCode?: string;
  featureParentModuleId?: string;
};

export type WorkflowGuide = {
  id: string;
  /** e.g. "Selling — from quote to getting paid". */
  title: string;
  /** One plain sentence describing the whole journey. */
  summary: string;
  /** Full written guide in Help & guides. */
  docHref?: string;
  steps: WorkflowStep[];
};

export const workflowGuides: WorkflowGuide[] = [
  {
    id: "selling",
    title: "Selling — from quote to getting paid",
    summary:
      "Give the customer a price, confirm their order, deliver the items, bill them, then record their payment. You can start at any step, but this is the full journey.",
    docHref: "/app/documentation/kb/quotation-to-sales-flow",
    steps: [
      {
        id: "quotation",
        short: "Quotation",
        title: "Give the customer a price (Quotation)",
        what: "Create a quotation listing the items and prices, then print or email it to the customer. Nothing leaves your stock yet — it is just an offer.",
        href: "/app/quotation/quotations",
        routePrefixes: ["/app/quotation"],
        moduleCode: "quotation",
      },
      {
        id: "sales-order",
        short: "Sales Order",
        title: "Confirm the order (Sales Order)",
        what: "When the customer says yes, turn the quotation into a sales order. Inside New Sales Order, click Load Slip → Quotation so the lines copy over — no retyping.",
        href: "/app/sales-order/sales-orders",
        routePrefixes: ["/app/sales-order"],
        moduleCode: "sales_order",
      },
      {
        id: "deliver",
        short: "Deliver",
        title: "Deliver the items (Pick list & Delivery notes)",
        what: "Release the stock from the Pick list and record the delivery. If an item tracks serial numbers, scan each unit here so your records match what left the store.",
        href: "/app/sales-order/sales-orders/release",
        routePrefixes: [
          "/app/sales-order/sales-orders/release",
          "/app/sales-order/delivery-receipts",
          "/app/sales-order/shipping",
        ],
        moduleCode: "sales_order",
      },
      {
        id: "invoice",
        short: "Sales Invoice",
        title: "Bill the customer (Sales Invoice)",
        what: "Create the sales invoice — inside New Sales, click Load Slip → Sales Order to pull in what was delivered. This is the official record of the sale and what the customer owes.",
        href: "/app/sales/sales",
        routePrefixes: ["/app/sales", "/app/selling"],
        moduleCode: "sales",
      },
      {
        id: "payment",
        short: "Payment",
        title: "Record the payment (Receipts)",
        what: "When the customer pays, record it under Accounts → Receipts and apply it to their invoice. The invoice then shows as paid and your receivables stay accurate.",
        href: "/app/finance/official-receipts",
        routePrefixes: ["/app/finance/official-receipts"],
        moduleCode: "finance",
      },
    ],
  },
  {
    id: "buying",
    title: "Buying — from request to paying your supplier",
    summary:
      "Ask to buy, order from the supplier, receive the items into stock, record the supplier's bill, then pay it. You can start at the Purchase Order if you skip internal requests.",
    docHref: "/app/documentation/kb/purchase-request-to-ap-flow",
    steps: [
      {
        id: "request",
        short: "Request",
        title: "Ask to buy (Purchase Request)",
        what: "List what you need to buy and why. This step is optional — if your team does not use internal requests, start straight at the Purchase Order.",
        href: "/app/purchase-request/purchase-requests",
        routePrefixes: ["/app/purchase-request"],
        optional: true,
        moduleCode: "purchase_request",
      },
      {
        id: "order",
        short: "Purchase Order",
        title: "Order from the supplier (Purchase Order)",
        what: "Create a purchase order for your supplier. Use Load Slip to copy lines from a purchase request, or use RFQ first to compare prices from several suppliers.",
        href: "/app/purchase-order/purchase-orders",
        routePrefixes: ["/app/purchase-order", "/app/buying"],
        moduleCode: "purchase_order",
      },
      {
        id: "receive",
        short: "Purchase Receive",
        title: "Receive stock (Purchase Receive)",
        what: "When the delivery arrives, create a Purchase Receive from the purchase order and scan serial numbers if the items are tracked. Attach delivery proof. Posting puts items into stock.",
        href: "/app/purchase-order/goods-receipt",
        routePrefixes: ["/app/purchase-order/goods-receipt"],
        moduleCode: "purchase_order",
      },
      {
        id: "bill",
        short: "Bill",
        title: "Declare amount owed (Bill)",
        what: "Create the Bill — inside New Bill, click Load Slip → Purchase Receive to pull in received lines (recommended). This records exactly what you owe the supplier.",
        href: "/app/purchases/purchase-receive",
        routePrefixes: ["/app/purchases"],
        moduleCode: "purchases",
      },
      {
        id: "pay",
        short: "Payment Made",
        title: "Pay the supplier (Payment Made)",
        what: "Record payment under Accounting → Payment Made and apply it to the Bill. The Bill then shows as paid and your payables stay accurate.",
        href: "/app/finance/disbursements",
        routePrefixes: ["/app/finance/disbursements", "/app/finance/payment-vouchers"],
        moduleCode: "finance",
        featureCode: "finance.payment_vouchers",
        featureParentModuleId: "finance",
      },
    ],
  },
  {
    id: "serial-lot",
    title: "Serial & lot tracking — from setup to reports",
    summary:
      "Turn on tracking per item, scan units in when you receive them, scan them out when you sell, then check the registry any time you need history.",
    docHref: "/app/documentation/kb/serial-barcode-scanning",
    steps: [
      {
        id: "enable",
        short: "Item setup",
        title: "Turn on tracking for the item (Items)",
        what: "Open the item and enable Track serial (or Track lot). Only tracked items ask for serial or lot numbers on documents — untracked items show a dash instead.",
        href: "/app/inventory/items",
        moduleCode: "inventory",
      },
      {
        id: "receive",
        short: "Scan in",
        title: "Scan units in when receiving (Goods Receipt)",
        what: "On the goods receipt, scan each unit's serial number (or enter lot numbers and quantities). Posting the receipt registers every unit in your stock.",
        href: "/app/purchase-order/goods-receipt",
        moduleCode: "purchase_order",
      },
      {
        id: "sell",
        short: "Scan out",
        title: "Scan units out when selling (Sales)",
        what: "On the sales document, scan the serial number of the exact unit that leaves the store. You can also scan a serial into the scan bar to add the item line automatically.",
        href: "/app/sales/sales",
        moduleCode: "sales",
      },
      {
        id: "registry",
        short: "Serials",
        title: "Find units and manage warranty (Serials)",
        what: "The Serials list shows where every unit is. Open a serial for unit warranty dates, customer coverage after sale, and history. Use reports under More to reconcile counts.",
        href: "/app/inventory/serial-lot/registry",
        routePrefixes: ["/app/inventory/serial-lot"],
        moduleCode: "inventory",
        featureCode: "inventory.serial_lot",
        featureParentModuleId: "inventory",
      },
    ],
  },
  {
    id: "pos",
    title: "POS — set up the register, then sell",
    summary:
      "Administrators configure products and tax under Manage. Cashiers open a shift on Terminal, check out walk-in sales, then close the shift with counted cash.",
    docHref: "/app/documentation/kb/pos-checkout-guide",
    steps: [
      {
        id: "manage",
        short: "Manage",
        title: "Set up catalog and register (POS Manage)",
        what: "Choose which products appear on the grid, set categories, default location, tax, tenders, and optional auto-post to accounting. Cashiers do not need this page.",
        href: "/app/pos/manage",
        routePrefixes: ["/app/pos/manage", "/app/pos/setup"],
        moduleCode: "pos",
      },
      {
        id: "terminal",
        short: "Terminal",
        title: "Sell at the counter (POS Terminal)",
        what: "Open a shift, scan or tap items into the cart, take payment, hold bills if a customer steps away, then close the shift. Checkout creates a sales invoice and reduces stock.",
        href: "/app/pos",
        routePrefixes: ["/app/pos"],
        moduleCode: "pos",
      },
    ],
  },
  {
    id: "stock",
    title: "Stock — set up masters, then move inventory",
    summary:
      "Add partners and items, set locations, then use stock movements and entries to adjust or transfer quantities. Serial & lot tracking has its own Guide when you open that area.",
    docHref: "/app/documentation/kb/inventory-master-data",
    steps: [
      {
        id: "partners",
        short: "Customers",
        title: "Add customers and vendors",
        what: "Create customer and vendor records once. Documents pick them from this list. Sales shows Customers; Purchase shows Vendors.",
        href: "/app/inventory/partners?kind=customer",
        routePrefixes: ["/app/inventory/partners"],
        moduleCode: "inventory",
      },
      {
        id: "items",
        short: "Items",
        title: "Create products and services (Items)",
        what: "Add SKUs, prices, and flags such as Track serial or Track lot. Everything you sell or stock needs an item record.",
        href: "/app/inventory/items",
        routePrefixes: ["/app/inventory/items"],
        moduleCode: "inventory",
      },
      {
        id: "locations",
        short: "Locations",
        title: "Set warehouses and bins (Locations)",
        what: "Define where stock lives — main warehouse, store floor, or project site. Movements and POS shifts use these locations.",
        href: "/app/inventory/locations",
        routePrefixes: ["/app/inventory/locations"],
        moduleCode: "inventory",
      },
      {
        id: "move",
        short: "Movements",
        title: "Transfer or adjust stock (Movements & Entries)",
        what: "Use stock movements and stock entries to transfer between locations or correct quantities. Check History on a row when you need an audit trail.",
        href: "/app/inventory/stock-movements",
        routePrefixes: [
          "/app/inventory/stock-movements",
          "/app/inventory/stock-adjustments",
          "/app/inventory/stock-entries",
          "/app/inventory/stock-reconciliation",
        ],
        moduleCode: "inventory",
      },
      {
        id: "reports",
        short: "Reports",
        title: "Check balances and ageing (Stock reports)",
        what: "Open On Hand, Stock Balance, Stock Ledger, or Stock Ageing when you need quantities and valuation — not when entering documents.",
        href: "/app/inventory/reports/on-hand",
        routePrefixes: ["/app/inventory/reports", "/app/inventory"],
        moduleCode: "inventory",
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting — books, journals, and statements",
    summary:
      "Review the chart of accounts, post journal entries, run trial balance and statements, then use receivables & payables tools for checks and aging books. Customer receipts and supplier vouchers stay on the Selling / Buying guides.",
    docHref: "/app/documentation/kb/finance-accounts-overview",
    steps: [
      {
        id: "workspace",
        short: "Workspace",
        title: "Open the accounting desk (Workspace)",
        what: "The Accounting workspace summarizes open receivables and payables and links into general ledger and books. Start here when you are not sure which screen to open.",
        href: "/app/finance",
        routePrefixes: ["/app/finance/reports", "/app/finance/budgets"],
        moduleCode: "finance",
      },
      {
        id: "ledger",
        short: "General ledger",
        title: "Journals and chart of accounts (General ledger)",
        what: "Maintain the chart of accounts, draft and post journal entries, and open trial balance, P&L, balance sheet, and cash flow under General ledger.",
        href: "/app/finance/acct-i/journal-entries",
        routePrefixes: ["/app/finance/acct-i"],
        moduleCode: "finance",
        featureCode: "finance.acct_i",
        featureParentModuleId: "finance",
      },
      {
        id: "arap",
        short: "AR & AP books",
        title: "Checks, withholding, and aging books (Receivables & payables)",
        what: "Use check register, withholding tax, landed cost, notes, and customer/vendor books when you need Philippine-style A/R and A/P detail beyond simple receipts and vouchers.",
        href: "/app/finance/acct-ii/checks",
        routePrefixes: ["/app/finance/acct-ii"],
        moduleCode: "finance",
        featureCode: "finance.acct_ii",
        featureParentModuleId: "finance",
      },
      {
        id: "desk",
        short: "Home",
        title: "Accounting home (Workspace)",
        what: "Return to the Accounting workspace for shortcuts and open balances. Official receipts and payment vouchers appear under the Selling and Buying guides when you are on those screens.",
        href: "/app/finance",
        routePrefixes: ["/app/finance"],
        moduleCode: "finance",
      },
    ],
  },
  {
    id: "crm",
    title: "CRM — leads to follow-ups",
    summary:
      "Capture leads, track opportunities and quote pipelines, then work follow-up tasks and warranty coverage so nothing falls through after the sale.",
    docHref: "/app/documentation/kb/crm-follow-ups",
    steps: [
      {
        id: "dashboard",
        short: "Pipeline",
        title: "See your CRM desk (My pipeline)",
        what: "Your CRM dashboard shows quotes to chase, tasks due, and reminders — different from the company Business Dashboard.",
        href: "/app/crm/dashboard",
        routePrefixes: ["/app/crm/dashboard", "/app/crm/notifications"],
        moduleCode: "crm",
      },
      {
        id: "leads",
        short: "Leads",
        title: "Capture new interest (Leads)",
        what: "Log people or companies that might buy. Qualify them before turning them into opportunities or quotations.",
        href: "/app/crm/leads",
        routePrefixes: ["/app/crm/leads"],
        moduleCode: "crm",
      },
      {
        id: "pipeline",
        short: "Opportunities",
        title: "Track deals and quotes (Opportunities & quote board)",
        what: "Move opportunities through stages and use the quote board to see open quotations that need a call or email.",
        href: "/app/crm/opportunities",
        routePrefixes: ["/app/crm/opportunities", "/app/crm/pipelines"],
        moduleCode: "crm",
      },
      {
        id: "tasks",
        short: "Follow-ups",
        title: "Work the follow-up list (Tasks)",
        what: "Complete follow-up tasks on time. Link tasks to quotations or partners so the next action is clear.",
        href: "/app/crm/follow-up-tasks",
        routePrefixes: ["/app/crm/follow-up-tasks", "/app/crm"],
        moduleCode: "crm",
      },
    ],
  },
  {
    id: "operations",
    title: "Projects — hub to calendar and costing",
    summary:
      "Run work from the Operations hub, schedule on the calendar, optionally load an industry pack, then track job costing when you need project spend.",
    docHref: "/app/documentation/kb/operations-hub-intro",
    steps: [
      {
        id: "hub",
        short: "Hub",
        title: "Organize work items (Work hub)",
        what: "Create or open a workspace, move cards across columns, and link ERP documents when a task relates to a quote, PO, or invoice.",
        href: "/app/operations",
        routePrefixes: ["/app/operations/dashboard", "/app/operations/timeline", "/app/operations/automation"],
        moduleCode: "operations",
      },
      {
        id: "calendar",
        short: "Calendar",
        title: "Schedule the week (Calendar)",
        what: "Plan timed tasks and day jobs on the calendar so the team knows what is due today.",
        href: "/app/operations/calendar",
        routePrefixes: ["/app/operations/calendar"],
        moduleCode: "operations",
      },
      {
        id: "packs",
        short: "Packs",
        title: "Start from an industry pack (optional)",
        what: "Industry packs pre-seed columns and starter tasks for construction, retail, services, and more. Skip this if you already have a custom board.",
        href: "/app/operations/packs",
        routePrefixes: ["/app/operations/packs"],
        optional: true,
        moduleCode: "operations",
      },
      {
        id: "costing",
        short: "Job costing",
        title: "Track project spend (Job costing)",
        what: "Link expenses and documents to a project when you need cost vs budget for a job.",
        href: "/app/operations/job-costing",
        routePrefixes: ["/app/operations/job-costing", "/app/operations"],
        moduleCode: "operations",
      },
    ],
  },
  {
    id: "after-sales",
    title: "After-sales — intake to repair",
    summary:
      "Register a customer repair intake, manage repair orders through the shop, then check status reports when customers ask for updates.",
    docHref: "/app/documentation/kb/after-sales-repair",
    steps: [
      {
        id: "intake",
        short: "Intake",
        title: "Take the unit in (Customer intake)",
        what: "Register what the customer brought in, symptoms, and contact details before shop work starts.",
        href: "/app/after-sales/register-repair",
        routePrefixes: ["/app/after-sales/register-repair"],
        moduleCode: "after_sales",
      },
      {
        id: "repair",
        short: "Repair orders",
        title: "Work the repair (Repair orders)",
        what: "Create and update repair orders, parts used, and progress until the unit is ready for pickup.",
        href: "/app/after-sales/repair-orders",
        routePrefixes: ["/app/after-sales/repair-orders", "/app/after-sales"],
        moduleCode: "after_sales",
      },
    ],
  },
  {
    id: "hr",
    title: "HR & payroll — people to pay",
    summary:
      "Maintain employees, record attendance and leave, run payroll, then prepare remittances. Self-service (ESS) is for employees viewing their own info.",
    docHref: "/app/documentation/kb/hr-payroll-basics",
    steps: [
      {
        id: "employees",
        short: "Employees",
        title: "Hire and maintain people (Employees)",
        what: "Create employee records with pay items and TIN details. Active hires can spawn onboarding tasks automatically.",
        href: "/app/hr/employees",
        routePrefixes: ["/app/hr/employees", "/app/hr/hire-onboarding"],
        moduleCode: "hr",
      },
      {
        id: "time",
        short: "Time",
        title: "Attendance and leave",
        what: "Record attendance and approve leave so payroll has the right days and absences.",
        href: "/app/hr/attendance",
        routePrefixes: ["/app/hr/attendance", "/app/hr/leave", "/app/hr/absenteeism"],
        moduleCode: "hr",
      },
      {
        id: "payroll",
        short: "Payroll",
        title: "Run payroll",
        what: "Create a payroll run for the period, review totals, then post. Use special runs for 13th month or final pay when needed.",
        href: "/app/hr/payroll-runs",
        routePrefixes: ["/app/hr/payroll-runs", "/app/hr/pay-items", "/app/hr/special-runs"],
        moduleCode: "hr",
      },
      {
        id: "remit",
        short: "Remittances",
        title: "Government remittances",
        what: "Prepare remittance files or schedules after payroll for SSS, PhilHealth, Pag-IBIG, and similar contributions.",
        href: "/app/hr/remittances",
        routePrefixes: ["/app/hr/remittances", "/app/hr"],
        moduleCode: "hr",
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Production — recipe to stock to ship",
    summary:
      "Define a recipe (BOM), run a job (work order) from stock or a customer order, release to the floor, optionally QC and weigh parts into lots, complete into inventory, then pack for one customer and sell.",
    docHref: "/app/documentation/kb/manufacturing-bom",
    steps: [
      {
        id: "bom",
        short: "Recipe",
        title: "Define the recipe (BOM)",
        what: "List parts and quantities. Use Cut apart (disassembly) when one whole item becomes several cut SKUs (e.g. meat or fabric).",
        href: "/app/production/boms",
        routePrefixes: ["/app/production/boms"],
        moduleCode: "manufacturing",
      },
      {
        id: "wo",
        short: "Job",
        title: "Create a job (work order)",
        what: "Make-to-stock: New job. Make-to-order: From customer order (Load Slip) on Jobs, or create from the Sales Order screen.",
        href: "/app/production/work-orders",
        routePrefixes: ["/app/production/work-orders", "/app/production"],
        moduleCode: "manufacturing",
      },
      {
        id: "release",
        short: "Release",
        title: "Release to the floor",
        what: "Release to floor starts the job. Pass FG QC when required. For serial/lot items, use Issue materials and Weigh parts / Receive from the job row.",
        href: "/app/production/work-orders?status=draft",
        routePrefixes: ["/app/production/work-orders", "/app/production/issue-station", "/app/production/receive-station"],
        moduleCode: "manufacturing",
      },
      {
        id: "weigh",
        short: "Weigh",
        title: "Weigh parts into stock",
        what: "On a released job, weigh catch-weight lots (cut SKUs or finished goods) at the receive station before or as you complete.",
        href: "/app/production/receive-station",
        routePrefixes: ["/app/production/receive-station", "/app/production/weigh-parts"],
        moduleCode: "manufacturing",
      },
      {
        id: "qc",
        short: "QC",
        title: "Release finished-goods inspection (if required)",
        what: "When Production QC is on in Process policies, Hold/Release FG inspection on the job before Complete.",
        href: "/app/production/work-orders?status=released",
        routePrefixes: ["/app/production/work-orders"],
        moduleCode: "manufacturing",
      },
      {
        id: "complete",
        short: "Complete",
        title: "Complete into stock",
        what: "Complete posts material issue and finished or cut stock. For cut-apart jobs, enter actual input kg when the whole weighs differently than planned.",
        href: "/app/production/work-orders?status=released",
        routePrefixes: ["/app/production/work-orders"],
        moduleCode: "manufacturing",
      },
      {
        id: "pack",
        short: "Pack",
        title: "Pack and ship for one customer",
        what: "Open a pack session on the customer order (one box per customer), then use shipping orders. Sell from on-hand cut or finished lots (FEFO when perishable).",
        href: "/app/inventory/serial-lot/pack-station",
        routePrefixes: ["/app/inventory/serial-lot/pack-station", "/app/sales-order/shipping", "/app/sales"],
        moduleCode: "manufacturing",
      },
    ],
  },
  {
    id: "quality",
    title: "Quality — NCR to CAPA",
    summary:
      "Log non-conformances, raise QC requests when inspection is needed, then drive corrective and preventive actions to close the loop.",
    docHref: "/app/documentation/kb/quality-ncr-capa",
    steps: [
      {
        id: "ncr",
        short: "NCR",
        title: "Record a non-conformance (NCR)",
        what: "Capture what failed, where, and how severe it is so quality and operations share one record.",
        href: "/app/quality/ncrs",
        routePrefixes: ["/app/quality/ncrs"],
        moduleCode: "quality",
      },
      {
        id: "qc",
        short: "QC",
        title: "Request inspection (QC requests)",
        what: "Ask for a quality check on receipts, production, or returns when policy requires inspection before accept.",
        href: "/app/quality/qc-requests",
        routePrefixes: ["/app/quality/qc-requests"],
        moduleCode: "quality",
        optional: true,
      },
      {
        id: "capa",
        short: "CAPA",
        title: "Fix the root cause (CAPA)",
        what: "Open corrective / preventive actions from NCRs and track them to completion so the same defect does not repeat.",
        href: "/app/quality/capa",
        routePrefixes: ["/app/quality/capa", "/app/quality"],
        moduleCode: "quality",
      },
    ],
  },
  {
    id: "support",
    title: "Support — tickets to resolution",
    summary:
      "Log customer support tickets, work them through status changes, and link after-sales or CRM records when the issue needs more than a reply.",
    docHref: "/app/documentation/kb/support-tickets",
    steps: [
      {
        id: "tickets",
        short: "Tickets",
        title: "Open and work tickets",
        what: "Create a ticket for the customer issue, assign an owner, update status, and close when resolved. Use Help & guides if you need portal setup.",
        href: "/app/support/tickets",
        routePrefixes: ["/app/support"],
        moduleCode: "support",
      },
    ],
  },
  {
    id: "comms",
    title: "Communications — connect then send",
    summary:
      "Connect your mailbox, send document emails from quotations and invoices, then review sent documents and inbox replies.",
    docHref: "/app/documentation/kb/communications-overview",
    steps: [
      {
        id: "settings",
        short: "Connect",
        title: "Connect email (Settings)",
        what: "Link Gmail or your mail provider under Communications → Settings so the team can send documents from Bluearm.",
        href: "/app/comms/settings",
        routePrefixes: ["/app/comms/settings"],
        moduleCode: "comms",
      },
      {
        id: "sent",
        short: "Sent",
        title: "Review what was sent (Sent documents)",
        what: "Check the sent documents list for delivery status and open a document again if a customer asks for a resend.",
        href: "/app/comms/sent-documents",
        routePrefixes: ["/app/comms/sent-documents", "/app/comms/inbox", "/app/comms"],
        moduleCode: "comms",
      },
    ],
  },
  {
    id: "fixed-assets",
    title: "Fixed assets — register to depreciate",
    summary:
      "Record capital assets on the register, then run depreciation periods so books stay in sync with the asset register.",
    docHref: "/app/documentation/kb/fixed-assets-register",
    steps: [
      {
        id: "register",
        short: "Register",
        title: "Add assets (Asset register)",
        what: "Create each asset with cost, useful life, and accounts so depreciation can post correctly.",
        href: "/app/fixed-assets",
        routePrefixes: ["/app/fixed-assets"],
        moduleCode: "fixed_assets",
      },
    ],
  },
  {
    id: "booking",
    title: "Booking — resources to reservations",
    summary:
      "Define bookable resources and services, then take bookings on the calendar so capacity and appointments stay visible.",
    docHref: "/app/documentation/kb/booking-services",
    steps: [
      {
        id: "setup",
        short: "Setup",
        title: "Define resources and services",
        what: "Create the rooms, people, or equipment that can be booked, plus the services customers request.",
        href: "/app/booking/resources",
        routePrefixes: ["/app/booking/resources", "/app/booking/services"],
        moduleCode: "booking",
      },
      {
        id: "book",
        short: "Bookings",
        title: "Take bookings (Calendar & list)",
        what: "Schedule appointments on the calendar or bookings list and keep status updated when customers arrive or cancel.",
        href: "/app/booking/calendar",
        routePrefixes: ["/app/booking/calendar", "/app/booking/bookings", "/app/booking"],
        moduleCode: "booking",
      },
    ],
  },
];

export type ResolvedWorkflow = {
  guide: WorkflowGuide;
  stepIndex: number;
  /** Steps after filtering disabled modules/features (same as guide.steps when unfiltered). */
  visibleSteps: WorkflowStep[];
};

export function filterWorkflowSteps(steps: WorkflowStep[], me: MeData | null | undefined): WorkflowStep[] {
  return steps.filter((step) => {
    if (step.moduleCode && !isTenantModuleEnabled(me, step.moduleCode)) return false;
    if (
      step.featureCode &&
      step.featureParentModuleId &&
      !isTenantFeatureEnabled(me, step.featureCode, step.featureParentModuleId)
    ) {
      return false;
    }
    return true;
  });
}

/** Find the workflow and step that matches the current page, if any. */
export function resolveWorkflowForPath(
  pathname: string,
  me?: MeData | null,
): ResolvedWorkflow | null {
  let best: { guide: WorkflowGuide; stepIndex: number; prefixLen: number; visibleSteps: WorkflowStep[] } | null =
    null;
  for (const guide of workflowGuides) {
    const visibleSteps = filterWorkflowSteps(guide.steps, me);
    if (visibleSteps.length === 0) continue;
    for (let i = 0; i < visibleSteps.length; i++) {
      for (const prefix of visibleSteps[i].routePrefixes ?? []) {
        // Boundary-safe: "/app/sales" must not match "/app/sales-order/...".
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
          if (!best || prefix.length > best.prefixLen) {
            best = { guide, stepIndex: i, prefixLen: prefix.length, visibleSteps };
          }
        }
      }
    }
  }
  return best
    ? { guide: { ...best.guide, steps: best.visibleSteps }, stepIndex: best.stepIndex, visibleSteps: best.visibleSteps }
    : null;
}
