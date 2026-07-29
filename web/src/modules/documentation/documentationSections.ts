import type { DocSection } from "./documentationTypes";
import { documentationGroups } from "./documentationGroups";

export const documentationSections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    iconId: "documentation",
    intro: "A quick tour of how the app is laid out and how to move between tasks.",
    blocks: [
      {
        type: "paragraph",
        text: "After you sign in, you land inside your company workspace. The left sidebar lists the main areas of the app—Inventory, Sales, Quotations, Operations, Communications, and so on. Click a name to open that area.",
      },
      {
        type: "paragraph",
        text: "When you open an area, tabs appear under the page title at the top. These tabs switch between related tasks. For example, under Quotation you will see New Quotation, Quotation List, and status reports.",
      },
      {
        type: "steps",
        items: [
          "Pick an area from the left sidebar.",
          "Use the tabs under the title to open the screen you need.",
          "Use the list screens to find existing records; double-click or use the edit action to open details.",
          "Save your work before leaving a form.",
        ],
      },
      {
        type: "tip",
        text: "Have a specific situation in mind—multiple businesses, branches, POS checkout, or moving stock? Open Help & guides → Knowledge base for scenario walkthroughs covering every module.",
      },
      {
        type: "paragraph",
        text: "New to Bluearm? After a trial, you land on the workspace setup wizard. The Dashboard shows a Start here checklist until foundation is complete. Then open /app/onboarding for the full ERP + POS playbook — each step links to Knowledge base articles for plain-language help.",
      },
    ],
  },
  {
    id: "first-week",
    title: "Your first week",
    iconId: "documentation",
    intro: "A plain-language playbook for getting your business running in Bluearm.",
    primaryHref: "/app/onboarding",
    primaryLabel: "Open onboarding playbook",
    blocks: [
      {
        type: "steps",
        items: [
          "Complete workspace setup at /app/setup — confirm seeded company, COA, tax, process policies, and location; add partners and products.",
          "Open /app/onboarding for the full ERP + POS playbook with tracked progress.",
          "Week 1: Review process policies again if needed and enable modules (POS, WMS, Quality).",
          "Week 2: First selling flow — quotation, sales order, pick list, invoice (Load Slip), customer payment.",
          "Week 3: First buying flow — purchase request, RFQ, PO, goods receipt, supplier invoice, pre-invoicing report.",
          "Week 4: POS — configure Manage, open shift, checkout, close shift.",
          "Review reports: Receivable/Payable Status, pre-invoicing, Customer/Vendor Book.",
          "Invite teammates and open the Business Dashboard for alerts and reconciliation.",
        ],
      },
      {
        type: "tip",
        text: "On a demo workspace? Explore the sample data first, then start a 90-day trial when you are ready to enter your own records.",
      },
    ],
  },
  {
    id: "setup-wizard",
    title: "Workspace setup wizard",
    iconId: "documentation",
    intro: "Required foundation before quotations, sales, purchases, or POS transactions.",
    primaryHref: "/app/setup",
    primaryLabel: "Open setup wizard",
    blocks: [
      {
        type: "paragraph",
        text: "Every new workspace is provisioned with a standard Philippine SME chart of accounts (general ledger), PHP currency, standard VAT types, and a default Main location. Bank accounts for banking are a separate setup — they are not the same as GL cash accounts. The setup wizard makes you review and confirm those seeds, then add at least one partner and one product. Until required steps are done, the API blocks new selling and buying documents.",
      },
      {
        type: "steps",
        items: [
          "Company — open branding, set your legal name and logo, then click Confirm.",
          "Chart of accounts — review the standard GL accounts and default mappings (cash, A/R, A/P, sales, VAT), then Looks good.",
          "Currency & tax — open tax types, adjust if needed, then Confirm.",
          "Process policies — review quotation/SO/GR gates and release mode, then Confirm.",
          "Location — confirm Main or add branches, then Confirm.",
          "Partners — add at least one customer or supplier.",
          "Products — add at least one item; enable Track serial if you will scan units.",
          "Optional: invite teammates under User Management.",
        ],
      },
      {
        type: "paragraph",
        text: "Owners and store admins are sent to /app/setup after starting a trial or when opening the dashboard with incomplete setup. You can Skip for now — a reminder bar stays in the header until foundation is complete.",
      },
      {
        type: "tip",
        text: "Invited team members see that setup is in progress; only administrators can finish the wizard. Use the Dashboard checklist or /app/onboarding for the extended playbook after foundation.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Business Dashboard",
    iconId: "dashboard",
    intro: "A single screen for owners and managers to see how the business is doing today.",
    primaryHref: "/app/dashboard",
    primaryLabel: "Open Business Dashboard",
    blocks: [
      {
        type: "paragraph",
        text: "The Business Dashboard opens with Financial health: cash in vs out, overdue invoice alerts, profit by product/project, recurring expense burn, and sales pipeline. Below that, receivables/payables cards and operations tiles summarize sales, stock warnings, open purchase orders, and other alerts. While workspace setup is incomplete, a Start here checklist appears at the top for administrators.",
      },
      {
        type: "paragraph",
        text: "Receivables and payables cards use aging totals — click through to A/R or A/P aging for detail. Cash flow summarizes posted cash journals (incoming, outgoing, net). Bank account registers are a separate concern from the general ledger chart of accounts.",
      },
      {
        type: "paragraph",
        text: "Operations tiles and charts show how sales and stock movement changed month by month. The red flags section lists items that need attention—such as stock counts that do not match serial numbers, purchase orders not fully received, or delivery receipts without invoices.",
      },
      {
        type: "tip",
        text: "If you do not see the Business Dashboard in your sidebar, your administrator can enable it for your role in User Management.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    iconId: "inventory",
    intro: "Set up customers, suppliers, items, and track how much stock you have on hand.",
    primaryHref: "/app/inventory/items",
    primaryLabel: "Open Items",
    blocks: [
      {
        type: "paragraph",
        text: "Inventory is the foundation of the app. Before you quote or sell, you need partners (customers and suppliers), locations (warehouses or branches), and items (products you buy and sell).",
      },
      {
        type: "steps",
        items: [
          "Open Partners to add customers and suppliers.",
          "Open Locations to define where stock is kept.",
          "Open Items to create product records with prices and descriptions.",
          "Open Stock Movements to review increases and decreases in quantity over time.",
        ],
      },
      {
        type: "paragraph",
        text: "Each item can be set to track quantity on hand. Some items can also track serial numbers (one unique number per unit) or lot batches (groups received together). Turn those options on in the item record when you need that level of detail.",
      },
      {
        type: "paragraph",
        text: "Product Bundles let you sell a kit as one line on a sales order; when you pick a bundle item, you can explode it into component lines with prices from your price list. Price Lists support selling lists (customers) and buying lists (suppliers)—use the Selling / Buying filter when maintaining rates.",
      },
      {
        type: "paragraph",
        text: "Every master and stock list includes a History link (and edit modals show a History button). Open it to see who created or changed that partner, item, location, project, department, bundle, stock entry, or movement—same audit trail pattern used on Sales and Purchases. Global Activity Logs remain available for administrators.",
      },
      {
        type: "tip",
        text: "Open Stock → Workspace for a quick view of stock KPIs. Use settings on each list screen to choose which columns appear on forms.",
      },
    ],
  },
  {
    id: "serial-lot",
    title: "Serial and lot tracking",
    iconId: "inventory",
    intro: "Follow individual units from purchase through sale when items have serial numbers or lot batches.",
    primaryHref: "/app/inventory/serial-lot/receive",
    primaryLabel: "Open Receive / Scan",
    blocks: [
      {
        type: "flow",
        items: [
          "Purchase Request",
          "Purchase Order",
          "Receive goods",
          "Sales Order",
          "Release",
          "Delivery receipt (optional)",
          "Sales invoice",
        ],
      },
      {
        type: "paragraph",
        text: "When an item uses serial numbers, you scan or enter each unit when goods arrive. That unit appears in the Serial Registry as in stock. When you release a sales order, you pick which serial numbers go to the customer. With delivery receipts enabled, posting a DR issues stock; with legacy combined release, release deducts stock immediately and DR is documentary. When you invoice the sale, those units are marked as sold.",
      },
      {
        type: "paragraph",
        text: "Receiving adds stock. Releasing prepares items for shipping and reserves them for the order. Invoicing completes the sale. For lot-tracked items (without individual serials), you enter lot numbers and quantities when receiving instead of scanning each unit.",
      },
      {
        type: "steps",
        items: [
          "Create a Purchase Request, then convert it to a Purchase Order.",
          "Open Serial & Lot → Receive / Scan to receive against the purchase order.",
          "Create a Sales Order, then use Release Sales Order to allocate stock (and pick serials if needed).",
          "Post a Delivery Receipt when goods leave the warehouse (split release mode).",
          "Create a Sales invoice from released or delivered lines.",
          "Use Serial Trace to look up the full operational history of one serial number (receive, transfer, reserve, issue).",
          "On Serial Registry and Lot Batches, use History for the audit trail of who registered or adjusted that unit or lot.",
        ],
      },
      {
        type: "tip",
        text: "Serial Trace answers “what happened to this unit in stock?” History answers “who changed the record in the system?” Use both when investigating discrepancies.",
      },
      {
        type: "tip",
        text: "Open Inventory → Serial & Lot for the registry, lot batches, movements, and trace lookup screens.",
      },
    ],
  },
  {
    id: "quotation",
    title: "Quotations",
    iconId: "quotation",
    intro: "Send price offers to customers before they place a firm order.",
    primaryHref: "/app/quotation/quotations",
    primaryLabel: "Open Quotation List",
    blocks: [
      {
        type: "paragraph",
        text: "A quotation is a formal price offer. You list items, quantities, and prices. When the customer accepts, you can convert the quote into a sales order without retyping the lines.",
      },
      {
        type: "steps",
        items: [
          "Click New Quotation to start a fresh quote.",
          "Choose the customer, location, and tax type.",
          "Add line items from your item list and adjust quantities and prices.",
          "Save and print or send the quotation to the customer.",
          "When ready, convert open quote lines to a sales order from the quotation screen, or use Load Slip → Quotation on New Sales Order.",
        ],
      },
      {
        type: "paragraph",
        text: "You can also invoice directly from an open quotation using Load Slip → Quotation on New Sale when your process policy allows skipping the sales order step.",
      },
      {
        type: "paragraph",
        text: "Quotation List shows all quotes. Quotation Status and Outstanding Quote Status help you find quotes that are still open, expired, or waiting for follow-up. For a Kanban of the same quotes by stage, open Quote board under CRM (also linked from Quotation tabs).",
      },
    ],
  },
  {
    id: "tax-setup",
    title: "Tax and currency setup",
    iconId: "quotation",
    intro: "Configure how tax and currency appear on quotations and orders.",
    primaryHref: "/app/quotation/tax-mngt/tax-types",
    primaryLabel: "Open Tax Types",
    blocks: [
      {
        type: "paragraph",
        text: "Before quoting or ordering, set up at least one tax type (for example VAT included or VAT excluded) and your default currency. Quotations and sales orders use these settings when calculating line totals.",
      },
      {
        type: "steps",
        items: [
          "Open Quotation in the sidebar, then Tax Management in the sub-menu or header tabs.",
          "Open Tax Types to add or edit how tax is calculated.",
          "Open Currencies to set your default currency and exchange rates if you sell in more than one currency.",
        ],
      },
      {
        type: "tip",
        text: "Most businesses only need one or two tax types. Ask your accountant which setup matches your receipts.",
      },
    ],
  },
  {
    id: "sales-order",
    title: "Sales orders",
    iconId: "sales_order",
    intro: "Record customer orders before you ship and invoice them.",
    primaryHref: "/app/sales-order/sales-orders",
    primaryLabel: "Open Sales Order List",
    blocks: [
      {
        type: "paragraph",
        text: "A sales order is a confirmed customer order. It reserves the deal but does not always move stock until you release it. You can create orders from scratch or from accepted quotation lines.",
      },
      {
        type: "steps",
        items: [
          "Click New Sales Order or pick lines from an open quotation.",
          "Enter customer, delivery date, and line items.",
          "Save the order and track its progress on Sales Order List or Sales Order Status.",
        ],
      },
      {
        type: "paragraph",
        text: "Release Sales Order is the step where you confirm what will ship. You enter release quantities (and pick serial numbers for tracked items). When a line item is a product bundle, you can explode it into component lines before saving. In legacy combined mode, stock is reduced when you release. In split mode, release reserves quantity and a posted Delivery Receipt deducts stock.",
      },
      {
        type: "paragraph",
        text: "Delivery Receipt List and New Delivery Receipt record what left the warehouse against a sales order. Use them when your process policy turns off legacy combined release.",
      },
      {
        type: "paragraph",
        text: "On New Sales Order, use Load Slip → Quotation to copy open quote lines without retyping. This is the fastest way to turn an accepted quote into a confirmed order.",
      },
      {
        type: "paragraph",
        text: "Outstanding S/O Status shows orders that still have balance quantity not yet released, delivered, or invoiced.",
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping & delivery",
    iconId: "sales_order",
    intro: "Shipping orders, freight rules, and delivery trips after sales orders.",
    primaryHref: "/app/sales-order/shipping/orders",
    primaryLabel: "Open Shipping Orders",
    blocks: [
      {
        type: "paragraph",
        text: "Under Sales Order → Shipping, create shipping orders linked to customers and locations. Enter zone and carrier to auto-resolve flat freight from shipping rules.",
      },
      {
        type: "steps",
        items: [
          "Maintain Shipping Rules with zone, carrier, and flat freight amount.",
          "Create a Shipping Order — freight fills in when rules match.",
          "Use Delivery Trips to group outbound deliveries for drivers or couriers.",
          "On New Sale, Load Slip → Shipping Order invoices SO lines already linked to a shipping order.",
        ],
      },
    ],
  },
  {
    id: "sales",
    title: "Sales list",
    iconId: "sales",
    intro: "Create sales and track billing status.",
    primaryHref: "/app/sales/sales",
    primaryLabel: "Open Sales list",
    blocks: [
      {
        type: "paragraph",
        text: "Sales list holds your billing documents (sales). Lines can come from released sales orders or be entered directly for walk-in sales. When you bill from a sales order line, the system checks that you have released enough quantity first.",
      },
      {
        type: "steps",
        items: [
          "Click New sales to create a sale.",
          "Select the customer, then use Load Slip to pull lines from Sales Order, Quotation, or Shipping Order — or enter lines manually.",
          "For serial-tracked items, pick the serial numbers that match the quantity.",
          "Save as Unconfirmed first. Upload attachments in the Attachments section if your store requires files before Confirm.",
          "Confirm when ready and print packing slips or sales documents as needed.",
        ],
      },
      {
        type: "paragraph",
        text: "Sales Status and Pre-Invoicing Status help you see which orders are ready to bill. Pre-Invoicing lists SO lines with balance not yet invoiced. Reports such as A/R by Customer show who still owes money on open invoices.",
      },
      { type: "heading", text: "Sales commission" },
      {
        type: "paragraph",
        text: "Under Sales → Commission Rules, define rates by salesperson and/or item category. Commission accrues automatically when a sale is marked Completed.",
      },
    ],
  },
  {
    id: "collective-invoicing",
    title: "Collective invoicing",
    iconId: "sales",
    intro: "Group multiple sales into one combined invoice for a customer.",
    primaryHref: "/app/sales/collective-invoicing/list",
    primaryLabel: "Open Collective Invoicing",
    blocks: [
      {
        type: "paragraph",
        text: "Collective invoicing lets you merge several sales documents into one invoice slip. This is useful when a customer receives many deliveries in a period but pays one combined bill.",
      },
      {
        type: "steps",
        items: [
          "Open Collective Invoicing (Sales) from the sidebar under Sales.",
          "Create a new collective invoice and select the sales lines to include.",
          "Review totals and save.",
          "Print the collective invoice or slip when ready.",
        ],
      },
    ],
  },
  {
    id: "purchase-request",
    title: "Purchasing",
    iconId: "purchase_request",
    intro: "Request stock from suppliers, turn requests into orders, and record when goods arrive.",
    primaryHref: "/app/purchase-request/purchase-requests",
    primaryLabel: "Open Purchase Request List",
    blocks: [
      {
        type: "paragraph",
        text: "Purchasing starts with a Purchase Request—a internal list of what you want to buy. After approval, you create a Purchase Order to send to the supplier. When goods arrive, you record a Goods Receipt so stock increases.",
      },
      {
        type: "flow",
        items: ["Purchase Request", "Purchase Order", "Goods Receipt", "Stock updated"],
      },
      {
        type: "steps",
        items: [
          "Create a Purchase Request with supplier and line items — optional Load Slip (from Sales Order) for customer demand.",
          "Submit for approval when your store requires it; approvers confirm the request before PO creation.",
          "Create a Purchase Order — use Load Slip from Purchase Request or Supplier Quotation (RFQ).",
          "Confirm the purchase order.",
          "When shipment arrives, open Goods Receipt List or Serial & Lot → Receive / Scan to receive against the order.",
          "If Quality is enabled, set inspection to Released on draft receipts before posting; Held receipts block stock posting until released.",
        ],
      },
      {
        type: "paragraph",
        text: "Buying workspace lists Purchase Status, Pre-Invoicing (Purchases), and Payable Status reports. RFQ under Purchase Order lets you collect vendor quotes before ordering.",
      },
      {
        type: "tip",
        text: "Purchase Order List and Goods Receipt List are under Purchase Request in the sidebar.",
      },
    ],
  },
  {
    id: "data-ops",
    title: "Data Center & WMS",
    iconId: "inventory",
    intro: "Inbound file ingestion and warehouse scheduled receipts (opt-in modules).",
    primaryHref: "/app/data-center/inbox",
    primaryLabel: "Open Data Center Inbox",
    blocks: [
      { type: "heading", text: "Data Center" },
      {
        type: "paragraph",
        text: "Data Center ingests external files using ingestion rules. Review the inbox, map columns, and load rows into staging before posting to inventory or finance lists.",
      },
      { type: "heading", text: "WMS scheduled receipt" },
      {
        type: "paragraph",
        text: "WMS (when enabled) lets you schedule expected inbound receipts against PO lines. Use it to plan dock appointments and compare scheduled vs actual GR quantities.",
      },
      {
        type: "tip",
        text: "Enable Data Center and WMS under User Management → Module & Features if they do not appear in the sidebar.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance and accounts",
    iconId: "finance",
    intro: "Receipts, payables, general ledger (bookkeeping), and receivables & payables tools.",
    primaryHref: "/app/finance",
    primaryLabel: "Open Accounting Workspace",
    blocks: [
      {
        type: "paragraph",
        text: "The Accounting workspace summarizes open receivables, payables, and shortcuts into General ledger (journals, chart of accounts, financial statements) and Receivables & payables (checks, withholding, books, aging details).",
      },
      { type: "heading", text: "General ledger — journals and statements" },
      {
        type: "steps",
        items: [
          "Journal entries, Chart of accounts, Trial balance, Profit & loss, and Balance sheet.",
          "Official receipts (customer collections) and Payment vouchers (vendor payments).",
          "Supplier invoices matched to goods receipts; bank reconciliation (reconciles GL cash — bank account master lists are separate).",
        ],
      },
      { type: "heading", text: "Receivables & payables — checks, withholding, import cost" },
      {
        type: "steps",
        items: [
          "Check Register — checks auto-register when you pay by check on a payment voucher.",
          "Withholding Tax — maintain BIR-style codes; add withholding lines on payment vouchers; print BIR 2307 from the voucher list.",
          "Set payor TIN under Settings → Branding → Receipt Tax ID; set vendor TIN on the partner record.",
          "Landed Cost — allocate import/freight to GR lines; Post updates unit cost on receipt lines.",
          "Notes, Company Budgets, and Contracts for extended A/R and A/P tracking.",
        ],
      },
      { type: "heading", text: "AR / AP reports" },
      {
        type: "steps",
        items: [
          "A/R by Customer and A/P by Vendor — open balances by partner.",
          "Receivable Status (Selling) and Payable Status (Buying) — as-of balances.",
          "Customer/Vendor Book I (AR/AP) — slip-level debit/credit ledger with running balance.",
          "SI Receipt Status and Supplier Payment Status — line-level collection and payment progress.",
        ],
      },
      { type: "heading", text: "Budget control" },
      {
        type: "paragraph",
        text: "Company budgets can warn or block purchase requests and POs when spend exceeds budget. Budget vs Actual report shows utilization; the dashboard flags overruns.",
      },
      {
        type: "tip",
        text: "Default PH withholding codes (1–15%) seed automatically. Fixed Assets (separate module) posts monthly depreciation when you run a depreciation period.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports catalog",
    iconId: "reports",
    intro: "Search and browse reports by category with plain-language descriptions.",
    primaryHref: "/app/reports",
    primaryLabel: "Open Reports Center",
    blocks: [
      {
        type: "paragraph",
        text: "Reports Center lists analytics and status reports across selling, stock, buying, finance, and CRM. Use search or the category sidebar to find a report; each row shows a short plain-language blurb and links to the live screen (CSV export where available). Department hubs also link to focused report pages under Selling, Buying, and Accounting.",
      },
      {
        type: "steps",
        items: [
          "Open Reports → Catalog (Reports Center) and type a keyword, or pick a category.",
          "Selling: Receivable Status · Sales pre-invoicing (unbilled SO lines).",
          "Buying: Purchase Status · Payable Status · Purchase pre-invoicing (unbilled GR lines).",
          "Finance: Customer/Vendor Book I (AR/AP) · Trial Balance · AR/AP Status · Cash flow.",
          "Open a report, set filters, Run Report / Search (F8), and export CSV when available.",
          "Open Saved Views to store named filter sets on catalog reports (Ad-hoc BI).",
        ],
      },
      {
        type: "tip",
        text: "Home shows Total Receivables, Total Payables, and Cash Flow cards; click through for full aging and cash-flow reports.",
      },
    ],
  },
  {
    id: "crm",
    title: "CRM and follow-ups",
    iconId: "crm",
    intro: "Track customer follow-ups, warranties, and personal sales reminders.",
    primaryHref: "/app/crm/dashboard",
    primaryLabel: "Open CRM Dashboard",
    blocks: [
      {
        type: "paragraph",
        text: "CRM helps salespeople stay on top of customers. The CRM Dashboard focuses on your own pipeline—quotes to chase, tasks due, and warranty dates coming up. It is different from the Business Dashboard, which looks at the whole company.",
      },
      {
        type: "steps",
        items: [
          "Check CRM Dashboard and Notifications for items that need attention.",
          "Use Follow-up Tasks to schedule calls or visits.",
          "Open Warranty coverage to see sold products under warranty for your customers.",
          "Use Quote board to see quotes at each sales stage (same quotes as Quotation → List).",
        ],
      },
      {
        type: "tip",
        text: "When Operations Hub is enabled, follow-up tasks also appear as work items on the Operations board. Drag a card in either place to update status.",
      },
      {
        type: "tip",
        text: "The bell icon at the top of the screen shows CRM alerts when you have new notifications. The floating Help (?) button opens the help assistant; the ticket button above it opens a new support ticket. Drag the pair to move them; double-click to reset position.",
      },
      {
        type: "tip",
        text: "Quote board is a CRM stage view of quotations — create and edit quote lines under Quotation. Warranty coverage tracks sold-asset end dates; After-Sales handles repair jobs.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations Hub",
    iconId: "crm",
    intro: "Plan projects on Kanban boards, calendars, and timelines linked to ERP documents.",
    primaryHref: "/app/operations",
    primaryLabel: "Open Work Hub",
    blocks: [
      {
        type: "paragraph",
        text: "Operations Hub is for project and task management inside Bluearm. Each workspace is a board with columns (for example Backlog, In progress, Done). Work items can link to customers, quotations, purchase orders, and job cost projects.",
      },
      {
        type: "steps",
        items: [
          "Open Operations from the sidebar. Pick a workspace from the selector at the top (your choice is remembered).",
          "On Work Hub, switch between Kanban and table views. Drag cards to change column or status.",
          "Use Calendar or Timeline for date-based planning; Dashboard shows budget vs actual when a job cost project is linked.",
          "Create a workspace from scratch or load a sample project from the empty state. Industry packs (Construction, Retail, Services, and others) pre-seed columns and starter tasks.",
          "From a work item, use Create Quotation to start a sales quote with project context filled in.",
        ],
      },
      {
        type: "tip",
        text: "On demo tenants, run User Management → Demo Data → Populate to load the Riverside Office Renovation sample workspace with linked quotation and work items.",
      },
    ],
  },
  {
    id: "comms",
    title: "Communications",
    iconId: "crm",
    intro: "Email documents with PDF attachments and review what was sent.",
    primaryHref: "/app/comms/sent-documents",
    primaryLabel: "Open Sent Documents",
    blocks: [
      {
        type: "paragraph",
        text: "Communications logs every document email your team sends. Use the Email button on saved quotations, sales orders, sales invoices, purchase orders, RFQs, and supplier invoices (purchases). Each send queues a PDF attachment through the server.",
      },
      {
        type: "steps",
        items: [
          "Save the document first, then click Email in the document header (requires Send permission).",
          "Enter recipients and optional subject or message, then send.",
          "Open Communications → Sent Documents to see delivery status for all outbound messages.",
          "Open Communications → Settings to connect Gmail (optional) or confirm SMTP is configured on the server.",
          "When Gmail is connected, Communications → Inbox shows synced threads. Document modals also show an Email history panel—including purchase orders, RFQs, and purchases on the buying side.",
        ],
      },
      {
        type: "tip",
        text: "Selling documents (quotation, sales order, sale) and buying documents (PO, RFQ, purchase) all share the same sent-log and history pattern.",
      },
    ],
  },
  {
    id: "support",
    title: "Support tickets",
    iconId: "crm",
    intro: "Log customer issues, link warranty assets, and track resolution.",
    primaryHref: "/app/support/tickets",
    primaryLabel: "Open Support Tickets",
    blocks: [
      {
        type: "paragraph",
        text: "Support helps your team track customer issues after the sale. Each ticket links to a customer and can reference a warranty asset from CRM → Warranty coverage.",
      },
      {
        type: "steps",
        items: [
          "Create a ticket from Support → Tickets with subject, customer, and optional warranty asset.",
          "Update status as you work (open, in progress, waiting, resolved, closed).",
          "Add comments to keep an internal thread on the ticket.",
          "Assign an agent and optionally link a repair order from After-Sales.",
        ],
      },
    ],
  },
  {
    id: "fixed-assets",
    title: "Fixed assets",
    iconId: "fixed_assets",
    intro: "Register capital assets and run monthly straight-line depreciation.",
    primaryHref: "/app/fixed-assets",
    primaryLabel: "Open Asset Register",
    blocks: [
      {
        type: "paragraph",
        text: "Fixed Assets tracks capital equipment and other depreciable property. Each asset has cost, salvage value, useful life, and GL accounts for asset, accumulated depreciation, and expense.",
      },
      {
        type: "steps",
        items: [
          "Add assets in the Asset Register with acquisition date and accounts.",
          "Run monthly depreciation for the period; the system posts a journal entry per asset line.",
          "Review posted runs before closing the month.",
        ],
      },
    ],
  },
  {
    id: "job-costing",
    title: "Job costing",
    iconId: "job_costing",
    intro: "Project budgets, timesheets, and budget vs actual—separate from inventory Projects dimension.",
    primaryHref: "/app/operations/job-costing",
    primaryLabel: "Open Job Costing",
    blocks: [
      {
        type: "paragraph",
        text: "Job Costing is for job or project P&L tracking. It is not the same as Inventory → Projects (which tags stock and documents). Here you define a job, budget lines, and timesheet hours, then compare budget to actual costs.",
      },
      {
        type: "steps",
        items: [
          "Create a job cost project with budget lines.",
          "Enter timesheets against the job.",
          "Open budget vs actual to see variance.",
        ],
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    iconId: "manufacturing",
    intro: "Single-level BOMs with units of measure, scrap/yield, and work-order material preview (under Stock → Serial & Lot).",
    primaryHref: "/app/inventory/serial-lot/manufacturing/boms",
    primaryLabel: "Open Bills of Material",
    blocks: [
      {
        type: "paragraph",
        text: "Manufacturing covers in-house production under Stock → Serial & Lot. Define a BOM (finished item, output qty/UoM, yield %, and component lines with used qty, UoM, and scrap/spare qty), create a work order, review materials needed (on hand vs to issue), release it, then complete it to backflush components and receive finished goods.",
      },
      {
        type: "steps",
        items: [
          "Set item base units and conversions under Inventory → Units.",
          "Create a BOM with output qty/UoM, yield %, and component lines (used qty, UoM, scrap/spare qty).",
          "Create a work order, review materials needed vs on-hand, then release when ready.",
          "Complete the work order to issue converted stock (used + scrap/spare) and receive finished goods.",
        ],
      },
      {
        type: "tip",
        text: "Complete always reloads the live BOM. Used is what goes into the product; scrap/spare is extra measurable qty in the same UoM. Multi-level BOMs and routings are deferred.",
      },
    ],
  },
  {
    id: "quality",
    title: "Quality (QMS)",
    iconId: "quality",
    intro: "Goods receipt inspection and non-conformance records.",
    primaryHref: "/app/quality/ncrs",
    primaryLabel: "Open NCR List",
    blocks: [
      {
        type: "paragraph",
        text: "Quality adds inspection status on draft goods receipts. Receipts on hold cannot be posted until inspection is released.",
      },
      {
        type: "steps",
        items: [
          "On Goods Receipt List, set inspection to Held or Released while the receipt is still draft.",
          "Post only after inspection is Released.",
          "Log NCRs (non-conformance reports) for failed or suspect material.",
          "Open CAPA under Quality to track corrective actions beyond the initial NCR.",
        ],
      },
    ],
  },
  {
    id: "pos",
    title: "Point of sale",
    iconId: "pos",
    intro: "Retail counter sales: set up the catalog under Manage, then open shifts and check out on Terminal.",
    primaryHref: "/app/pos",
    primaryLabel: "Open POS Terminal",
    blocks: [
      {
        type: "paragraph",
        text: "POS has two screens. Terminal (/app/pos) is the full-screen cashier register. Manage (/app/pos/manage) is for administrators — products, categories, modifiers, tax, tenders, branding, and GL auto-post.",
      },
      {
        type: "heading",
        text: "Terminal (cashiers)",
      },
      {
        type: "steps",
        items: [
          "Open POS from the sidebar (or /app/pos).",
          "Choose the stock location and opening cash, then open the shift.",
          "Scan barcodes or tap products on the grid. Serial-tracked items need a serial before checkout.",
          "Checkout with cash, card, or split tenders. Hold a bill if the customer steps away.",
          "Close the shift at end of day and enter counted cash for the shift report.",
        ],
      },
      {
        type: "heading",
        text: "Manage (administrators)",
      },
      {
        type: "steps",
        items: [
          "Open POS → Manage (POS Management permission required).",
          "Products & Categories — decide what appears on the cashier grid and at what price.",
          "Settings — default location, tax type (inclusive/exclusive), tenders, order types, and optional sales/OR auto-post.",
          "Modifiers and branding — optional add-ons and store look/labels.",
        ],
      },
      {
        type: "tip",
        text: "Checkout creates a sales invoice and reduces stock at the shift location. Map Sales / Receivable / Cash accounts under Chart of Accounts and enable auto-post in POS Settings or Process Policies so journals post immediately. Offline actions queue on the device and sync when the network returns.",
      },
      {
        type: "tip",
        text: "Step-by-step knowledge base: POS checkout guide and POS Manage settings under Help & guides → Point of Sale. On Terminal and Manage, use Guide in the header for the short Manage → Terminal path.",
      },
    ],
  },
  {
    id: "booking",
    title: "Booking",
    iconId: "booking",
    intro: "Resources, priced services, and bookings that convert to quotations.",
    primaryHref: "/app/booking/bookings",
    primaryLabel: "Open Bookings",
    blocks: [
      {
        type: "paragraph",
        text: "Find Booking in the sidebar (below CRM). Use Calendar, Bookings, Resources, and Services — each has its own sidebar link and URL.",
      },
      {
        type: "steps",
        items: [
          "Enable Booking under User Management → Module & Features if it is missing (migration 195/196).",
          "Add Resources (staff/rooms) and Services (duration, buffer minutes, and price).",
          "Create a booking with customer, start/end, resource, and service — overlapping resource slots are blocked (buffer honored).",
          "Use Calendar for week/day/month views; list view for search and convert-to-quotation.",
          "Convert confirmed bookings with a customer to a draft quotation.",
        ],
      },
    ],
  },
  {
    id: "hr",
    title: "HR and payroll",
    iconId: "hr",
    intro: "Employees, leave, attendance, discipline, onboarding, evaluations, learning, and PH payroll.",
    primaryHref: "/app/hr/employees",
    primaryLabel: "Open Employees",
    blocks: [
      {
        type: "paragraph",
        text: "Workflow: Hire → Onboard → Attend → Leave → Payroll → Remit. ESS (My HR) is for employees linked via user_id.",
      },
      {
        type: "steps",
        items: [
          "Create employees (active hires auto-spawn hire onboarding + optional Day-1 orientation course).",
          "Capture DTR (manual edit/delete or biometric punches with in/out hours).",
          "Accrue leave balances, approve requests (stamps DTR leave); final pay cash-out uses cashable balances.",
          "Review absenteeism alerts; escalate to NTE/discipline cases and store letters in 201.",
          "Run payroll; export bank file; lock period; use remittance / 1601-C spreadsheet packs (not certified eFPS).",
          "Close the loop with evaluations and mandatory learning compliance.",
        ],
      },
      {
        type: "tip",
        text: "Bank/BIR export packs are labeled as spreadsheet / field packs—accountant must review before filing. Discipline letters are templates, not DOLE legal advice.",
      },
      {
        type: "tip",
        text: "Nav: Leave, Absenteeism, Discipline, Hire onboarding, Evaluations, Learning under HR & Payroll.",
      },
    ],
  },
  {
    id: "portal",
    title: "Customer portal",
    iconId: "crm",
    intro: "External read-only access for invited customers.",
    primaryHref: "/portal/login",
    primaryLabel: "Open Portal Login",
    blocks: [
      {
        type: "paragraph",
        text: "The customer portal is separate from the main ERP sign-in. Administrators invite portal users linked to a customer; users request a magic link to view their orders, invoices, and support tickets read-only.",
      },
      {
        type: "steps",
        items: [
          "An administrator creates a portal user for the customer partner.",
          "The customer opens the portal login page and requests a magic link.",
          "After signing in, they browse orders, invoices, and tickets scoped to their account only.",
        ],
      },
      {
        type: "tip",
        text: "Portal users cannot access internal modules or other customers’ data.",
      },
    ],
  },
  {
    id: "bi",
    title: "Saved report views",
    iconId: "reports",
    intro: "Save filter sets on catalog reports for quick reuse.",
    primaryHref: "/app/reports/saved-views",
    primaryLabel: "Open Saved Views",
    blocks: [
      {
        type: "paragraph",
        text: "Saved Views (Ad-hoc BI) let each user store named filter combinations on reports from the catalog. Exports use the same secure report APIs—no custom SQL.",
      },
      {
        type: "steps",
        items: [
          "Open a report from the catalog and set your filters.",
          "Save the view with a name from Reports → Saved Views or the report screen.",
          "Reload the view later or export CSV through the BI export proxy.",
        ],
      },
    ],
  },
  {
    id: "after-sales",
    title: "After-sales and repairs",
    iconId: "after_sales",
    intro: "Manage repair orders and service work after the sale.",
    primaryHref: "/app/after-sales/repair-orders",
    primaryLabel: "Open Repair Orders",
    blocks: [
      {
        type: "paragraph",
        text: "After-Sales covers repair orders and registered repairs. Use it when customers bring products back for service or when you track in-house repair work. Sold-unit warranty end dates live under CRM → Warranty coverage (also linked from After-Sales tabs).",
      },
      {
        type: "steps",
        items: [
          "Open Repair Order List to see existing jobs.",
          "Click New Repair Order to log a new service job with customer and item details.",
          "Use Repair Order Status to monitor progress across all open jobs.",
          "Register Repair screens handle day-to-day repair logging and consumption of parts.",
          "Open Warranty coverage when you need coverage end dates or CRM warranty follow-ups (not repair intake).",
          "Use History on a repair order or registration row (or the History button on the repair modal) to see who changed progress, parts, or attachments.",
        ],
      },
      {
        type: "tip",
        text: "Attachment uploads and progress updates roll into the same repair-order History timeline so technicians and supervisors share one audit view.",
      },
    ],
  },
  {
    id: "admin",
    title: "Settings for administrators",
    iconId: "user_management",
    intro: "Manage users, review activity, and customize company branding.",
    primaryHref: "/app/user-management/users",
    primaryLabel: "Open User Management",
    blocks: [
      {
        type: "paragraph",
        text: "These screens are usually for store owners and administrators. If you cannot open them, ask someone with admin access to help or to grant you permission in User Management.",
      },
      {
        type: "steps",
        items: [
          "User Management → Users: invite staff, assign role/groups, soft-delete/restore, rare Overrides.",
          "User Management → Roles: job templates (permission matrix). Prefer roles before Groups.",
          "User Management → Groups: optional team add-ons on top of a role.",
          "User Management → Data scopes: limit customers/locations when a role applies scopes (not for delete).",
          "User Management → Process Policies: require quotations, SO, PR approval, GR before supplier invoice, and legacy vs split SO release.",
          "User Management → Demo Data: populate or purge sample documents on DEMO000 / BLUEARM tenants.",
          "Activity Logs: see who changed important records across the tenant.",
          "On Inventory, After-Sales, Serial & Lot, and trading documents, open History on a single row or modal for a scoped timeline (no special global permission required for that record).",
          "Branding (from your account menu): upload your logo, set print names, and under Navigation rename sidebar modules and header tabs for your store.",
          "Use the floating Support ticket button (above Help) to open a new ticket from any screen — drag the pair out of the way if they cover content.",
        ],
      },
      {
        type: "tip",
        text: "Rename sidebar and tabs under Branding → Navigation. Leave a field blank to restore the default product name.",
      },
    ],
  },
  {
    id: "demo-data",
    title: "Demo data (training & QA)",
    iconId: "user_management",
    intro: "Load or reset sample documents on demo tenants without running SQL manually.",
    primaryHref: "/app/user-management/demo-data",
    primaryLabel: "Open Demo Data",
    blocks: [
      {
        type: "paragraph",
        text: "The Demo Data screen is for store administrators on DEMO000 or BLUEARM. It runs the same idempotent seed scripts used in development: quotations, purchase and sales chains, golden scenarios (serial GR→SI, lot sales, delivery receipt flow, PR approval, accounts payable), CRM fixtures, Operations Hub sample workspace (Riverside Office Renovation), Communications sent-message samples, and dashboard red-flag samples.",
      },
      {
        type: "steps",
        items: [
          "Open User Management → Demo Data.",
          "Choose Purge demo data to remove transactional documents and reset stock balances (partners, items, and locations stay).",
          "Choose Populate demo data with “Purge before populate” checked for a clean start.",
          "Review the status panel for golden scenario checks (S2, S8, S9, open PO receive), Operations workspace (demo-riverside-reno), and Communications sent samples (DEMO-COMMS-*).",
        ],
      },
      {
        type: "tip",
        text: "On hosted Supabase you can also run scripts from docs/runbooks/sql-run-order.md in the SQL Editor. The in-app tool embeds those scripts in the API—apply migration 056 first so permissions exist.",
      },
    ],
  },
  {
    id: "mapping-center",
    title: "Mapping Center",
    iconId: "user_management",
    intro: "Configure document generation rules (Generate Other Slips).",
    primaryHref: "/app/user-management/mapping-center",
    primaryLabel: "Open Mapping Center",
    blocks: [
      {
        type: "paragraph",
        text: "Mapping Center stores tenant rules for generating downstream documents from list selections—quotation to sales order, sales order to invoice or delivery receipt, purchase request to PO, and goods receipt to supplier invoice.",
      },
    ],
  },
  {
    id: "approvals",
    title: "Approvals queue",
    iconId: "dashboard",
    intro: "Review and approve pending documents.",
    primaryHref: "/app/dashboard/approvals",
    primaryLabel: "Open Approvals",
    blocks: [
      {
        type: "paragraph",
        text: "When process policies require SO, PO, or collective invoice approval, documents enter e-Approval status until an authorized user approves or rejects from the dashboard queue.",
      },
    ],
  },
  {
    id: "process-policies",
    title: "Process policies",
    iconId: "user_management",
    intro: "Configure which steps are required before the next document can be created.",
    primaryHref: "/app/user-management/process-policies",
    primaryLabel: "Open Process Policies",
    blocks: [
      {
        type: "paragraph",
        text: "Process policies let administrators enforce commercial flow gates: quotation before sales order, sales order before invoice, PR approval before PO, goods receipt before supplier invoice, and whether SO release combines reservation with stock deduction (legacy) or uses delivery receipts to issue stock. Attachment requirements (quotation, SO, sales, PO, supplier invoice) default on — save the document, upload at least one file, then confirm. Review and confirm policies during workspace setup (/app/setup/process-policies) before your first transactions.",
      },
      {
        type: "paragraph",
        text: "Defaults are skip-friendly with legacy combined SO release on. Turn policies on one at a time when rolling out stricter controls. The Business Dashboard red flags help find gaps—for example released but not delivered lines when DR is expected.",
      },
    ],
  },
  {
    id: "roadmap",
    title: "Still on the roadmap",
    iconId: "documentation",
    intro: "Capabilities not yet in the product or only partially covered.",
    blocks: [
      {
        type: "paragraph",
        text: "Most day-to-day BluearmERP features are live: document generation (Mapping Center), approvals with email, company budgets, Data Center, WMS, shipping rules, Receivables & payables (withholding/2307, landed cost, checks), sales commission, and CAPA.",
      },
      {
        type: "paragraph",
        text: "Still planned or partial: full Groupware, offline POS, multi-book depreciation, vendor portal write access, category-level item master on forms, and in-process manufacturing QC.",
      },
      {
        type: "tip",
        text: "Enable optional modules under User Management → Module & Features. Technical backlog notes live in docs/TIER_C_BACKLOG.md in the repository.",
      },
    ],
  },
];

export const defaultSectionId = "getting-started";

export function getDocSection(id: string | undefined): DocSection {
  return documentationSections.find((s) => s.id === id) ?? documentationSections[0];
}

/** All section ids in group display order (for prev/next navigation). */
export function orderedSectionIds(): string[] {
  return documentationGroups.flatMap((g) => g.sectionIds);
}
