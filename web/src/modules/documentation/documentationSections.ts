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
        text: "After you sign in, you land inside your company workspace. The left sidebar lists the main areas of the app—Inventory, Sales, Quotations, and so on. Click a name to open that area.",
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
        text: "New to Bluearm? Open the interactive checklist from your Dashboard (Start here), go to /app/onboarding for the full ERP + POS playbook, or use Onboarding under your account menu.",
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
          "Complete workspace setup at /app/setup (company, COA, tax, location, partners, items).",
          "Open /app/onboarding for the full ERP + POS playbook with tracked progress.",
          "Week 1: Review process policies and enable modules (POS, WMS, Quality).",
          "Week 2: First selling flow — quotation, sales order, pick list, invoice.",
          "Week 3: First buying flow — purchase request, PO, goods receipt, supplier invoice.",
          "Week 4: POS — configure Manage, open shift, checkout, close shift.",
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
    id: "dashboard",
    title: "Business Dashboard",
    iconId: "dashboard",
    intro: "A single screen for owners and managers to see how the business is doing today.",
    primaryHref: "/app/dashboard",
    primaryLabel: "Open Business Dashboard",
    blocks: [
      {
        type: "paragraph",
        text: "The Business Dashboard shows sales totals, stock warnings, open purchase orders, and other alerts in one place. It is meant for people who oversee the whole store, not just one salesperson.",
      },
      {
        type: "paragraph",
        text: "The number tiles at the top summarize this month’s sales, low-stock items, customers who still owe money, quotes that expired, and similar items. Click a tile to jump to the related list when you need to take action.",
      },
      {
        type: "paragraph",
        text: "Charts show how sales and stock movement changed month by month. The red flags section lists items that need attention—such as stock counts that do not match serial numbers, purchase orders not fully received, sales that exceed what was released from a sales order, reservations without delivery receipts, delivery receipts without invoices, goods receipts without supplier invoices, or supplier payments over-applied.",
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
          "Use Serial Trace to look up the full history of one serial number.",
        ],
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
          "When ready, convert open quote lines to a sales order from the quotation screen.",
        ],
      },
      {
        type: "paragraph",
        text: "Quotation List shows all quotes. Quotation Status and Outstanding Quote Status help you find quotes that are still open, expired, or waiting for follow-up.",
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
        ],
      },
    ],
  },
  {
    id: "sales",
    title: "Sales invoices",
    iconId: "sales",
    intro: "Create sales invoices (SI) and track billing status.",
    primaryHref: "/app/sales/sales",
    primaryLabel: "Open Sales List",
    blocks: [
      {
        type: "paragraph",
        text: "Sales invoices are your billing documents. Lines can come from released sales orders or be entered directly for walk-in sales. When you invoice from a sales order line, the system checks that you have released enough quantity first.",
      },
      {
        type: "steps",
        items: [
          "Click New Sales to create an invoice.",
          "Add lines manually or pull from released sales order lines.",
          "For serial-tracked items, pick the serial numbers that match the quantity.",
          "Save and print packing slips or sales documents as needed.",
        ],
      },
      {
        type: "paragraph",
        text: "Sales Status and Pre-invoicing Status help you see which orders are ready to bill. Reports such as A/R by Customer show who still owes money on open invoices.",
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
          "Create a Purchase Request with supplier and line items.",
          "Submit for approval when your store requires it; approvers confirm the request before PO creation.",
          "From the request, create a Purchase Order when you are ready to order.",
          "Confirm the purchase order.",
          "When shipment arrives, open Goods Receipt List or Serial & Lot → Receive / Scan to receive against the order.",
          "If Quality is enabled, set inspection to Released on draft receipts before posting; Held receipts block stock posting until released.",
        ],
      },
      {
        type: "paragraph",
        text: "Buying workspace and RFQ help you request quotes from suppliers and convert accepted supplier quotations into purchase orders. Vendor rates can resolve from buying price lists when PO lines have no unit price.",
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
    intro: "Receipts, payables, general ledger, Acct. I core GL, and Acct. II extended accounting.",
    primaryHref: "/app/finance",
    primaryLabel: "Open Accounts Workspace",
    blocks: [
      {
        type: "paragraph",
        text: "The Accounts workspace summarizes open receivables, payables, and shortcuts into Acct. I (core GL) and Acct. II (extended PH-style accounting).",
      },
      { type: "heading", text: "Acct. I — core ledger" },
      {
        type: "steps",
        items: [
          "Journal Entries, Chart of Accounts, Trial Balance, P&L, and Balance Sheet.",
          "Payment Receipts (customer collections) and Payment Vouchers (vendor payments).",
          "Supplier invoices matched to goods receipts; bank reconciliation.",
        ],
      },
      { type: "heading", text: "Acct. II — checks, withholding, import cost" },
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
    intro: "Find module reports and saved filter views in one place.",
    primaryHref: "/app/reports",
    primaryLabel: "Open Reports Catalog",
    blocks: [
      {
        type: "paragraph",
        text: "The Reports catalog lists analytics and status reports across selling, stock, buying, finance, and CRM. Each entry links to the live report screen and supports CSV export where available.",
      },
      {
        type: "steps",
        items: [
          "Open Reports → Catalog to browse by module.",
          "Open a report, set filters, and export if needed.",
          "Open Saved Views to store named filter sets on catalog reports (Ad-hoc BI).",
        ],
      },
      {
        type: "tip",
        text: "Scheduled report email is a stub in this release—exports run on demand from each report or saved view.",
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
          "Open Warranty Registry to see products under warranty for your customers.",
          "Use Quotation Pipeline to see quotes at each stage.",
        ],
      },
      {
        type: "tip",
        text: "The bell icon at the top of the screen shows CRM alerts when you have new notifications.",
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
        text: "Support helps your team track customer issues after the sale. Each ticket links to a customer and can reference a warranty asset from the CRM registry.",
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
    primaryHref: "/app/job-costing",
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
    intro: "Single-level bills of material and work orders with backflush on completion (under Stock → Serial & Lot).",
    primaryHref: "/app/inventory/serial-lot/manufacturing/boms",
    primaryLabel: "Open Bills of Material",
    blocks: [
      {
        type: "paragraph",
        text: "Manufacturing covers in-house production under Stock → Serial & Lot. Define a BOM (finished item plus component quantities), create a work order, release it, then complete it to backflush components and receive finished goods into stock.",
      },
      {
        type: "steps",
        items: [
          "Create a BOM with one finished item and component lines.",
          "Create a work order from the BOM and set quantity to produce.",
          "Release the work order when ready to start.",
          "Complete the work order to issue components and receipt finished goods.",
        ],
      },
      {
        type: "tip",
        text: "Multi-level BOMs, routings, and WIP lot trace are not in this MVP—use single-level BOMs only.",
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
    intro: "Walk-in checkout with shift open, cart, and cash tender.",
    primaryHref: "/app/pos",
    primaryLabel: "Open POS Terminal",
    blocks: [
      {
        type: "paragraph",
        text: "POS is a full-screen terminal for retail walk-in sales. Open a shift, scan or search items into the cart, take cash payment, and close the shift when done. Checkout creates a sales invoice and reduces stock.",
      },
      {
        type: "steps",
        items: [
          "Open POS from the sidebar (or go to /app/pos).",
          "Open shift with opening cash if prompted.",
          "Add items to the cart and complete checkout.",
          "Close shift at end of day for a summary.",
        ],
      },
      {
        type: "tip",
        text: "Offline mode and receipt printers are not supported in the web POS MVP.",
      },
    ],
  },
  {
    id: "hr",
    title: "HR and payroll",
    iconId: "hr",
    intro: "Employee master and monthly payroll runs with payslip stub.",
    primaryHref: "/app/hr/employees",
    primaryLabel: "Open Employees",
    blocks: [
      {
        type: "paragraph",
        text: "HR maintains employees separately from app login users. Payroll runs generate payslips for a pay period and post a payroll accrual journal entry stub to finance.",
      },
      {
        type: "steps",
        items: [
          "Add employees with base salary and department.",
          "Open Payroll Runs and run payroll for the period.",
          "Review payslips; accrual posts to configured GL accounts.",
        ],
      },
      {
        type: "tip",
        text: "Statutory tax tables vary by country—configure rates with your accountant; this MVP uses simple withholding stubs.",
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
    primaryLabel: "Open Repair Order List",
    blocks: [
      {
        type: "paragraph",
        text: "After-Sales covers repair orders and registered repairs. Use it when customers bring products back for service or when you track in-house repair work.",
      },
      {
        type: "steps",
        items: [
          "Open Repair Order List to see existing jobs.",
          "Click New Repair Order to log a new service job with customer and item details.",
          "Use Repair Order Status to monitor progress across all open jobs.",
          "Register Repair screens handle day-to-day repair logging and consumption of parts.",
        ],
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
          "User Management → Users: invite staff and link their email sign-in.",
          "User Management → Roles: control which areas each role can view or edit.",
          "User Management → Process Policies: require quotations, SO, PR approval, GR before supplier invoice, and legacy vs split SO release.",
          "User Management → Demo Data: populate or purge sample documents on DEMO000 / BLUEARM tenants.",
          "Activity Logs: see who changed important records.",
          "Branding (from your account menu): upload your logo and set the company name on printed documents.",
        ],
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
        text: "The Demo Data screen is for store administrators on DEMO000 or BLUEARM. It runs the same idempotent seed scripts used in development: quotations, purchase and sales chains, golden scenarios (serial GR→SI, lot sales, delivery receipt flow, PR approval, accounts payable), CRM fixtures, and dashboard red-flag samples.",
      },
      {
        type: "steps",
        items: [
          "Open User Management → Demo Data.",
          "Choose Purge demo data to remove transactional documents and reset stock balances (partners, items, and locations stay).",
          "Choose Populate demo data with “Purge before populate” checked for a clean start.",
          "Review the status panel for golden scenario checks (S2, S8, S9, open PO receive).",
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
        text: "Process policies let administrators enforce commercial flow gates: quotation before sales order, sales order before invoice, PR approval before PO, goods receipt before supplier invoice, and whether SO release combines reservation with stock deduction (legacy) or uses delivery receipts to issue stock.",
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
        text: "Most day-to-day BluearmERP features are live: document generation (Mapping Center), approvals with email, company budgets, Data Center, WMS, shipping rules, Acct II (withholding/2307, landed cost, checks), sales commission, and CAPA.",
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
