export type InvoiceSortField =
  | "invoice_date"
  | "customer_name"
  | "grand_total"
  | "receivable_no";

export type InvoiceSubtotalBy = "none" | "invoice_date" | "customer_name";

export type CollectiveInvoiceStatusTemplate = {
  sortField: InvoiceSortField;
  sortOrder: "asc" | "desc";
  sortField2: InvoiceSortField | "";
  sortOrder2: "asc" | "desc";
  subtotalBy: InvoiceSubtotalBy;
  printHeader: string;
  printFooter: string;
  logoAssetId: number | null;
};

const STORAGE_KEY = "bluearm.sales.collectiveInvoiceStatusTemplate";

export const INVOICE_SORT_OPTIONS: { value: InvoiceSortField; label: string }[] = [
  { value: "invoice_date", label: "Date" },
  { value: "customer_name", label: "Customer Name" },
  { value: "grand_total", label: "Total Sales" },
  { value: "receivable_no", label: "Receivable No." },
];

export const INVOICE_SUBTOTAL_OPTIONS: { value: InvoiceSubtotalBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "invoice_date", label: "Month" },
  { value: "customer_name", label: "Customer Name" },
];

export function defaultCollectiveInvoiceStatusTemplate(): CollectiveInvoiceStatusTemplate {
  return {
    sortField: "invoice_date",
    sortOrder: "desc",
    sortField2: "",
    sortOrder2: "asc",
    subtotalBy: "none",
    printHeader: "",
    printFooter: "",
    logoAssetId: null,
  };
}

export function loadCollectiveInvoiceStatusTemplate(): CollectiveInvoiceStatusTemplate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCollectiveInvoiceStatusTemplate();
    return { ...defaultCollectiveInvoiceStatusTemplate(), ...JSON.parse(raw) };
  } catch {
    return defaultCollectiveInvoiceStatusTemplate();
  }
}

export function saveCollectiveInvoiceStatusTemplate(template: CollectiveInvoiceStatusTemplate) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
}

export function templateToSearchParams(template: CollectiveInvoiceStatusTemplate): URLSearchParams {
  const qs = new URLSearchParams({
    sort: template.sortField,
    order: template.sortOrder,
    subtotal_by: template.subtotalBy,
  });
  if (template.sortField2) {
    qs.set("sort2", template.sortField2);
    qs.set("order2", template.sortOrder2);
  }
  if (template.logoAssetId) qs.set("logo_asset_id", String(template.logoAssetId));
  if (template.printHeader.trim()) qs.set("print_header", template.printHeader.trim());
  if (template.printFooter.trim()) qs.set("print_footer", template.printFooter.trim());
  return qs;
}

export function parseTemplateFromSearch(params: Record<string, string | string[]>): CollectiveInvoiceStatusTemplate {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const base = defaultCollectiveInvoiceStatusTemplate();
  const sort = get("sort") as InvoiceSortField;
  const sort2 = get("sort2") as InvoiceSortField | "";
  const order = get("order");
  const order2 = get("order2");
  const sub = get("subtotal_by") as InvoiceSubtotalBy;
  return {
    sortField: INVOICE_SORT_OPTIONS.some((o) => o.value === sort) ? sort : base.sortField,
    sortOrder: order === "asc" || order === "desc" ? order : base.sortOrder,
    sortField2: INVOICE_SORT_OPTIONS.some((o) => o.value === sort2) ? sort2 : "",
    sortOrder2: order2 === "asc" || order2 === "desc" ? order2 : base.sortOrder2,
    subtotalBy: INVOICE_SUBTOTAL_OPTIONS.some((o) => o.value === sub) ? sub : base.subtotalBy,
    printHeader: get("print_header") || "",
    printFooter: get("print_footer") || "",
    logoAssetId: (() => {
      const v = get("logo_asset_id");
      const n = Number(v);
      return v && Number.isFinite(n) ? n : null;
    })(),
  };
}

export function sortSubtotalLabel(template: CollectiveInvoiceStatusTemplate): string {
  const sort = INVOICE_SORT_OPTIONS.find((o) => o.value === template.sortField)?.label ?? "Date";
  const order = template.sortOrder === "asc" ? "↑" : "↓";
  let label = `${sort} ${order}`;
  if (template.subtotalBy !== "none") {
    const sub = INVOICE_SUBTOTAL_OPTIONS.find((o) => o.value === template.subtotalBy)?.label ?? template.subtotalBy;
    label += ` · Subtotal: ${sub}`;
  }
  return label;
}
