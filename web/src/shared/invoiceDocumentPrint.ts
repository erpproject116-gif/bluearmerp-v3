import { listAttachments, type Attachment } from "./attachments";
import { getPurchaseInvoice, getSalesInvoice, type PurchaseInvoice, type SalesInvoice } from "./invoiceApi";
import {
  fetchSupplierInvoicePrint,
  type SupplierInvoicePrintPayload,
} from "../modules/finance/supplier-invoices/supplierInvoicePrint";
import { fetchSalesPrint, type SalesPrintPayload } from "../modules/sales/sales/salesPrint";
import type { SupplierInvoiceLine } from "./useSupplierInvoiceList";
import type { DocumentLineRow } from "./documentLinePrint";

export type InvoiceDocumentKind = "sales" | "purchase";

export type InvoiceDocumentPrintData = {
  kind: InvoiceDocumentKind;
  title: string;
  docNo: string;
  docDate: string;
  dateNoDisplay?: string;
  partyLabel: string;
  partyName: string;
  partyContact?: string;
  taxTypeName?: string;
  currencyCode?: string;
  progressStatus?: string;
  pretax: number;
  tax: number;
  grand: number;
  lines: DocumentLineRow[];
  voucher: SalesInvoice | PurchaseInvoice;
  attachments: Attachment[];
};

type SalesLine = {
  line_no: number;
  item_code?: string;
  item_name?: string;
  description?: string | null;
  qty?: number;
  unit_code?: string | null;
  unit_non_vat?: number;
  non_vat_total?: number;
  tax_amount?: number;
  line_total?: number;
};

function mapLine(ln: SalesLine | SupplierInvoiceLine): DocumentLineRow {
  return {
    line_no: ln.line_no,
    item_code: ln.item_code,
    item_name: ln.item_name,
    description: ln.description ?? "",
    qty: ln.qty ?? 0,
    unit_code: ln.unit_code ?? "",
    unit_non_vat: ln.unit_non_vat ?? 0,
    non_vat_total: ln.non_vat_total ?? 0,
    tax_amount: ln.tax_amount ?? 0,
    line_total: ln.line_total ?? 0,
  };
}

function partyContactLine(p: { phone?: string | null; mobile?: string | null; email?: string | null }) {
  return [p.phone, p.mobile, p.email].filter(Boolean).join(" · ");
}

export type InvoiceDocumentPrintOptions = {
  /** Skip attachment fetch when another component already loads them (e.g. Invoice tab). */
  includeAttachments?: boolean;
};

async function loadSalesInvoiceDocument(id: number, opts?: InvoiceDocumentPrintOptions): Promise<InvoiceDocumentPrintData> {
  const includeAttachments = opts?.includeAttachments !== false;
  const [printRes, voucherRes, attRes] = await Promise.all([
    fetchSalesPrint(id),
    getSalesInvoice(id),
    includeAttachments ? listAttachments("sales", id) : Promise.resolve({ success: true, data: [] as Attachment[] }),
  ]);
  if (!printRes.success || !printRes.data) {
    throw new Error(printRes.message ?? "Failed to load document print data.");
  }
  if (!voucherRes.success || !voucherRes.data) {
    throw new Error(voucherRes.message ?? "Failed to load accounting invoice.");
  }
  const payload: SalesPrintPayload = printRes.data;
  const sale = payload.sales;
  const voucher = voucherRes.data;
  return {
    kind: "sales",
    title: "Sales Invoice",
    docNo: sale.sales_no,
    docDate: sale.order_date,
    dateNoDisplay: sale.date_no_display,
    partyLabel: "Customer",
    partyName: payload.partner.company_name || sale.customer_name,
    partyContact: partyContactLine(payload.partner) || undefined,
    taxTypeName: sale.tax_type_name ?? voucher.tax_type_name,
    currencyCode: sale.currency_code,
    progressStatus: sale.progress_status,
    pretax: sale.subtotal ?? voucher.pretax_amount,
    tax: sale.tax_total ?? voucher.tax,
    grand: sale.grand_total ?? voucher.grand_total,
    lines: ((sale.lines ?? []) as SalesLine[]).map(mapLine),
    voucher,
    attachments: attRes.success && attRes.data ? attRes.data : [],
  };
}

async function loadPurchaseInvoiceDocument(id: number, opts?: InvoiceDocumentPrintOptions): Promise<InvoiceDocumentPrintData> {
  const includeAttachments = opts?.includeAttachments !== false;
  const [printRes, voucherRes, attRes] = await Promise.all([
    fetchSupplierInvoicePrint(id),
    getPurchaseInvoice(id),
    includeAttachments
      ? listAttachments("finance/supplier-invoices", id)
      : Promise.resolve({ success: true, data: [] as Attachment[] }),
  ]);
  if (!printRes.success || !printRes.data) {
    throw new Error(printRes.message ?? "Failed to load document print data.");
  }
  if (!voucherRes.success || !voucherRes.data) {
    throw new Error(voucherRes.message ?? "Failed to load accounting invoice.");
  }
  const payload: SupplierInvoicePrintPayload = printRes.data;
  const inv = payload.supplier_invoice;
  const voucher = voucherRes.data;
  return {
    kind: "purchase",
    title: "Purchase Invoice",
    docNo: inv.invoice_no,
    docDate: inv.invoice_date,
    dateNoDisplay: inv.date_no_display,
    partyLabel: "Vendor",
    partyName: payload.partner.company_name || inv.vendor_name,
    partyContact: partyContactLine(payload.partner) || undefined,
    taxTypeName: inv.tax_type_name,
    currencyCode: inv.currency_code,
    progressStatus: inv.progress_status,
    pretax: inv.subtotal ?? voucher.pretax_amount,
    tax: inv.tax_total ?? voucher.tax,
    grand: inv.grand_total ?? voucher.grand_total,
    lines: (inv.lines ?? []).map(mapLine),
    voucher,
    attachments: attRes.success && attRes.data ? attRes.data : [],
  };
}

export async function loadInvoiceDocumentPrint(
  kind: InvoiceDocumentKind,
  id: number,
  opts?: InvoiceDocumentPrintOptions,
): Promise<InvoiceDocumentPrintData> {
  return kind === "sales" ? loadSalesInvoiceDocument(id, opts) : loadPurchaseInvoiceDocument(id, opts);
}

export function openSalesInvoicePrint(id: number) {
  window.open(`/app/sales/sales/${id}/invoice/print`, "_blank", "noopener,noreferrer");
}

export function openPurchaseInvoicePrint(id: number) {
  window.open(`/app/purchases/purchases/${id}/print`, "_blank", "noopener,noreferrer");
}
