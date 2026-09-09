export type ModalFormGuideDef = {
  id: string;
  title: string;
  summary: string;
  steps?: string[];
  docHref?: string;
};

export const MODAL_FORM_GUIDES: Record<string, ModalFormGuideDef> = {
  quotation: {
    id: "quotation",
    title: "Creating a quotation",
    summary: "A quotation is a price offer you send to a customer before they buy.",
    steps: [
      "Pick the customer (or add a new one).",
      "Add the items and quantities they asked about.",
      "Check tax and totals, then save and send.",
    ],
    docHref: "/docs/selling",
  },
  sales_order: {
    id: "sales_order",
    title: "Creating a sales order",
    summary: "A sales order records what the customer agreed to buy (upcoming sale).",
    steps: [
      "Select the customer.",
      "Add items, quantities, and delivery details.",
      "Save — you can later turn this into a sales invoice.",
    ],
    docHref: "/docs/selling",
  },
  sales: {
    id: "sales",
    title: "Creating a sale",
    summary: "A sales invoice is the bill you issue when you sell goods or services.",
    steps: [
      "Choose the customer and sales date.",
      "Add line items (or pull from a sales order).",
      "Review totals, attach files if needed, then save.",
    ],
    docHref: "/docs/selling",
  },
  purchase_request: {
    id: "purchase_request",
    title: "Creating a purchase request",
    summary: "A purchase request asks your team to buy something you need.",
    steps: [
      "Fill in who is requesting and where stock should go.",
      "Add the items and quantities needed.",
      "Save so purchasing can turn it into a purchase order.",
    ],
    docHref: "/docs/buying",
  },
  purchase_order: {
    id: "purchase_order",
    title: "Creating a purchase order",
    summary: "A purchase order is your official order to a supplier.",
    steps: [
      "Pick the vendor (or add a new one).",
      "Add items, prices, and delivery location.",
      "Save and send to the supplier when ready.",
    ],
    docHref: "/docs/buying",
  },
  supplier_invoice: {
    id: "supplier_invoice",
    title: "Recording a purchase invoice",
    summary: "A purchase invoice is the bill your supplier sent you.",
    steps: [
      "Select the vendor and invoice date.",
      "Enter lines that match what you received.",
      "Save so you can pay it later with a payment voucher.",
    ],
    docHref: "/docs/buying",
  },
  official_receipt: {
    id: "official_receipt",
    title: "Recording an official receipt",
    summary: "An official receipt records money you received from a customer.",
    steps: [
      "Pick the customer who paid.",
      "Enter the amount and how they paid.",
      "Apply the payment to open invoices, then save.",
    ],
  },
  payment_voucher: {
    id: "payment_voucher",
    title: "Recording a payment voucher",
    summary: "A payment voucher records money you paid to a vendor.",
    steps: [
      "Pick the vendor you paid.",
      "Enter the amount and payment method.",
      "Apply it to open purchase invoices, then save.",
    ],
  },
  hr_employee: {
    id: "hr_employee",
    title: "Adding an employee (201 file)",
    summary:
      "Employment holds day-to-day job details. 201 — statutory holds tax and government IDs. 201 — documents holds uploaded files after the employee is saved.",
    steps: [
      "Fill Employment (name, department, hire date, pay).",
      "Fill 201 — statutory (TIN, SSS, PhilHealth, Pag-IBIG, bank).",
      "Save, then open 201 — documents to upload scans.",
    ],
  },
  partner: {
    id: "partner",
    title: "Adding a customer or vendor",
    summary: "Partners are the companies you sell to or buy from.",
    steps: [
      "Choose customer or vendor.",
      "Enter the company name and contact details.",
      "Save — you can use them on invoices right away.",
    ],
  },
  delivery_receipt: {
    id: "delivery_receipt",
    title: "Creating a delivery receipt",
    summary: "A delivery receipt records goods you shipped to a customer from released sales orders.",
    steps: [
      "Set the delivery date.",
      "Select the released lines you are delivering now.",
      "Save to confirm the shipment quantities.",
    ],
    docHref: "/docs/selling",
  },
  goods_receipt: {
    id: "goods_receipt",
    title: "Recording a Purchase Receive",
    summary: "Purchase Receive records stock that arrived from a supplier against a purchase order, with optional delivery proof attachments.",
    steps: [
      "Choose the purchase order or lines you received.",
      "Confirm quantities and the receiving location; attach delivery proof if needed.",
      "Save so inventory on-hand updates — then create a Bill.",
    ],
    docHref: "/docs/buying",
  },
  mfg_bom_assembly: {
    id: "mfg_bom_assembly",
    title: "Creating an Assembly recipe",
    summary: "Describe the recipe, pick the finished product, and list raw materials per batch.",
    steps: [
      "Recipe code is the short ID operators search for; Description explains what this build is for.",
      "Choose the finished product and batch output qty — that is what one batch produces.",
      "Yield % is typical output vs materials (100 = no loss); it scales stock on jobs.",
      "Add each raw material line with qty used (plus optional scrap). Save when done.",
    ],
  },
  mfg_bom_disassembly: {
    id: "mfg_bom_disassembly",
    title: "Creating a Disassembly recipe",
    summary: "Describe the recipe, pick the whole item, and list expected output pieces per batch.",
    steps: [
      "Recipe code is the short ID; Description explains the cut or process.",
      "Choose the whole / raw item and batch input qty (one carcass, one slab, etc.).",
      "Yield % is typical output vs input; min/max % set the acceptable range on yield reports.",
      "Add each output line with expected qty. Save — Disassembly jobs will use this recipe.",
    ],
  },
  mfg_work_order_assembly: {
    id: "mfg_work_order_assembly",
    title: "Creating an Assembly job",
    summary: "Jobs run on the floor after release; QC and complete stay on the job list.",
    steps: [
      "Pick the Assembly recipe, location, and quantity to produce. Save as Draft.",
      "On the job row: Next: Release to floor when production should start.",
      "Use Issue materials and Receive FG (floor links) while status is In production.",
      "Pass QC in the Inspection column if enabled, then Next: Complete to post stock.",
    ],
  },
  mfg_work_order_disassembly: {
    id: "mfg_work_order_disassembly",
    title: "Creating a Disassembly job",
    summary: "Jobs run on the cut floor after release; QC and complete stay on the job list.",
    steps: [
      "Pick the Disassembly recipe, location, and quantity to process. Save as Draft.",
      "On the job row: Next: Release to floor when the cut should start.",
      "Use Issue whole (if tracked) and Weigh cuts while the job is released.",
      "Pass QC in Inspection if required, then Next: Complete (enter actual whole weight) to post cut lots.",
    ],
  },
  mfg_bom: {
    id: "mfg_bom",
    title: "Creating a recipe",
    summary: "A recipe lists materials and outputs for one batch.",
    steps: [
      "Choose the header item for this recipe type.",
      "Set batch qty and unit.",
      "Add line items with quantities.",
      "Save — jobs will use this recipe.",
    ],
  },
  mfg_work_order: {
    id: "mfg_work_order",
    title: "Creating a job",
    summary: "A job tells the floor how much to run using a recipe.",
    steps: [
      "Pick the recipe and production location.",
      "Enter the quantity for this run.",
      "Create as draft, release when ready, then complete from the job list.",
    ],
  },
  repair_order: {
    id: "repair_order",
    title: "Repair Order = RMA service job",
    summary:
      "Use Repair Order for defective returns: link the original sales invoice, receive the serial into an RMA warehouse (not sellable), repair, then release to active stock.",
    steps: [
      "Create/mark a Location with “RMA warehouse” and select it as Location.",
      "Enter original Sales Invoice no. and the sold Serial no., keep “Receive into RMA” checked.",
      "Diagnose/repair (progress statuses), then set Released + choose an active (non-RMA) release location.",
    ],
  },
  stock_adjustment: {
    id: "stock_adjustment",
    title: "Adjusting stock",
    summary: "Use this when physical count does not match the system quantity. Inventory updates only after approval.",
    steps: [
      "Pick the item and warehouse location.",
      "Enter the quantity change (increase or decrease).",
      "Add a short reason, then Submit for approval (or Save draft).",
    ],
  },
  item_master: {
    id: "item_master",
    title: "Adding an inventory item",
    summary: "Items are the products or materials you buy, sell, or stock.",
    steps: [
      "Enter the item name and choose a base unit of measure.",
      "Set pricing and tracking options if needed.",
      "Save — you can use the item on documents right away.",
    ],
  },
  serial_register: {
    id: "serial_register",
    title: "Registering a serial number",
    summary: "Register a unique serial so you can track one unit through stock and sales.",
    steps: [
      "Choose the item, location, and slip type.",
      "Enter the serial number (quantity is always 1).",
      "Save to place the unit on hand.",
    ],
  },
  journal_entry: {
    id: "journal_entry",
    title: "Creating a journal entry",
    summary: "A journal entry records accounting debits and credits that are not from invoices or receipts.",
    steps: [
      "Add a short remark describing the entry.",
      "Add lines with account, debit, and credit (totals must balance).",
      "Save as draft, then post when ready.",
    ],
  },
  support_ticket: {
    id: "support_ticket",
    title: "Opening a support ticket",
    summary: "Tell the Bluearm team about a problem or request so they can help.",
    steps: [
      "Write a clear subject and describe what happened.",
      "Attach screenshots if they help.",
      "Submit — you will get updates as the ticket is handled.",
    ],
  },
};

export function getModalFormGuide(id: string): ModalFormGuideDef | undefined {
  return MODAL_FORM_GUIDES[id];
}
