import type { DocSection } from "./documentationTypes";

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
        text: "Need step-by-step help for a specific area? Open Help & guides from the sidebar or from your account menu (click your name at the bottom of the sidebar).",
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
        type: "tip",
        text: "Use the settings link on each list screen to choose which columns and fields appear on your forms.",
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
        text: "Release Sales Order is the step where you confirm what will ship. You enter release quantities (and pick serial numbers for tracked items). In legacy combined mode, stock is reduced when you release. In split mode, release reserves quantity and a posted Delivery Receipt deducts stock.",
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
        ],
      },
      {
        type: "tip",
        text: "Purchase Order List and Goods Receipt List are under Purchase Request in the sidebar.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance and receipts",
    iconId: "finance",
    intro: "Record payments received from customers and view accounts receivable.",
    primaryHref: "/app/finance/official-receipts",
    primaryLabel: "Open Official Receipt List",
    blocks: [
      {
        type: "paragraph",
        text: "When a customer pays you, create an Official Receipt and apply it to their open sales invoices. This reduces what they still owe. For supplier bills, use Supplier Invoice List and Payment Voucher List to record accounts payable and partial payments against goods receipts.",
      },
      {
        type: "steps",
        items: [
          "Click New Official Receipt.",
          "Enter the customer, payment amount, and payment date.",
          "Apply the receipt to one or more open invoices.",
          "Save and print the receipt if needed.",
          "For vendors: post a Supplier Invoice against received PO lines, then create a Payment Voucher and apply it to open supplier invoices.",
        ],
      },
      {
        type: "paragraph",
        text: "A/R by Customer, SI Receipt Status, A/P by Vendor, and Supplier Payment Status reports show outstanding balances and which documents are fully paid.",
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
];

export const defaultSectionId = "getting-started";

export function getDocSection(id: string | undefined): DocSection {
  return documentationSections.find((s) => s.id === id) ?? documentationSections[0];
}
