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
    title: "Creating a sales invoice",
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
};

export function getModalFormGuide(id: string): ModalFormGuideDef | undefined {
  return MODAL_FORM_GUIDES[id];
}
