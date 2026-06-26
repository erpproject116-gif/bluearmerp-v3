import { detectPresetId } from "./salesDiscountStatusReportPresets";
import {
  defaultDiscountColumnVisibility,
  DISCOUNT_STATUS_COLUMNS,
  showDiscountColumn,
  type DiscountColumnKey,
  type DiscountColumnVisibility,
} from "./discountStatusColumns";

export type DiscountSortField =
  | "order_date"
  | "customer_name"
  | "sales_amount"
  | "invoicing_amount"
  | "difference_amount";

export type DiscountSubtotalBy = "none" | "order_date" | "customer_name";

export type DiscountReportPresetId = "default" | "with_apvl" | "graph" | "apvl_graph";

export type SalesDiscountStatusTemplate = {
  appliedPresetId: DiscountReportPresetId;
  customTemplateId: number | null;
  customTemplateCode: string | null;
  displayApvlLine: boolean;
  viewAsGraph: boolean;
  sortField: DiscountSortField;
  sortOrder: "asc" | "desc";
  sortField2: DiscountSortField | "";
  sortOrder2: "asc" | "desc";
  subtotalBy: DiscountSubtotalBy;
  printHeader: string;
  printFooter: string;
  logoAssetId: number | null;
  columnVisibility: DiscountColumnVisibility;
};

const STORAGE_KEY = "bluearm.sales.discountStatusTemplate";

export const DISCOUNT_SORT_OPTIONS: { value: DiscountSortField; label: string }[] = [
  { value: "order_date", label: "Date" },
  { value: "customer_name", label: "Customer Name" },
  { value: "sales_amount", label: "Sales Amount" },
  { value: "invoicing_amount", label: "Invoicing Amount" },
  { value: "difference_amount", label: "Difference Amount" },
];

export const DISCOUNT_SUBTOTAL_OPTIONS: { value: DiscountSubtotalBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "order_date", label: "Date" },
  { value: "customer_name", label: "Customer Name" },
];

export function defaultDiscountStatusTemplate(): SalesDiscountStatusTemplate {
  return {
    appliedPresetId: "default",
    customTemplateId: null,
    customTemplateCode: null,
    displayApvlLine: false,
    viewAsGraph: false,
    sortField: "order_date",
    sortOrder: "desc",
    sortField2: "",
    sortOrder2: "asc",
    subtotalBy: "none",
    printHeader: "",
    printFooter: "",
    logoAssetId: null,
    columnVisibility: defaultDiscountColumnVisibility(),
  };
}

export function loadDiscountStatusTemplate(): SalesDiscountStatusTemplate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDiscountStatusTemplate();
    const parsed = JSON.parse(raw) as Partial<SalesDiscountStatusTemplate>;
    const merged = { ...defaultDiscountStatusTemplate(), ...parsed };
    merged.appliedPresetId = detectPresetId(merged);
    return merged;
  } catch {
    return defaultDiscountStatusTemplate();
  }
}

export function saveDiscountStatusTemplate(template: SalesDiscountStatusTemplate) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
}

export function sortSubtotalLabel(template: SalesDiscountStatusTemplate): string {
  const sort = DISCOUNT_SORT_OPTIONS.find((o) => o.value === template.sortField)?.label ?? "Date";
  const order = template.sortOrder === "asc" ? "↑" : "↓";
  let label = `${sort} ${order}`;
  if (template.sortField2) {
    const sort2 = DISCOUNT_SORT_OPTIONS.find((o) => o.value === template.sortField2)?.label ?? template.sortField2;
    const order2 = template.sortOrder2 === "asc" ? "↑" : "↓";
    label += `, ${sort2} ${order2}`;
  }
  if (template.subtotalBy !== "none") {
    const sub = DISCOUNT_SUBTOTAL_OPTIONS.find((o) => o.value === template.subtotalBy)?.label ?? template.subtotalBy;
    label += ` · Subtotal: ${sub}`;
  }
  return label;
}

export function templateToSearchParams(template: SalesDiscountStatusTemplate): URLSearchParams {
  const qs = new URLSearchParams({
    sort: template.sortField,
    order: template.sortOrder,
    subtotal_by: template.subtotalBy,
  });
  if (template.sortField2) {
    qs.set("sort2", template.sortField2);
    qs.set("order2", template.sortOrder2);
  }
  if (template.displayApvlLine) qs.set("display_apvl_line", "1");
  if (template.viewAsGraph) qs.set("view_as_graph", "1");
  if (template.appliedPresetId !== "default") qs.set("report_template", template.appliedPresetId);
  if (template.customTemplateCode) qs.set("custom_template", template.customTemplateCode);
  if (template.logoAssetId) qs.set("logo_asset_id", String(template.logoAssetId));
  if (template.printHeader.trim()) qs.set("print_header", template.printHeader.trim());
  if (template.printFooter.trim()) qs.set("print_footer", template.printFooter.trim());
  const visibleCols = DISCOUNT_STATUS_COLUMNS
    .filter((c) => showDiscountColumn(c.key as DiscountColumnKey, template.columnVisibility, template.displayApvlLine))
    .map((c) => c.key);
  if (visibleCols.length < DISCOUNT_STATUS_COLUMNS.length) qs.set("columns", visibleCols.join(","));
  return qs;
}

export function parseTemplateFromSearch(params: Record<string, string | string[]>): SalesDiscountStatusTemplate {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const base = defaultDiscountStatusTemplate();
  const sort = get("sort") as DiscountSortField;
  const sort2 = get("sort2") as DiscountSortField | "";
  const order = get("order");
  const order2 = get("order2");
  const sub = get("subtotal_by") as DiscountSubtotalBy;
  const preset = get("report_template") as DiscountReportPresetId;
  const validPreset = ["default", "with_apvl", "graph", "apvl_graph"].includes(preset) ? preset : base.appliedPresetId;
  const parsed: SalesDiscountStatusTemplate = {
    appliedPresetId: validPreset,
    customTemplateId: null,
    customTemplateCode: get("custom_template") || null,
    displayApvlLine: get("display_apvl_line") === "1",
    viewAsGraph: get("view_as_graph") === "1",
    sortField: DISCOUNT_SORT_OPTIONS.some((o) => o.value === sort) ? sort : base.sortField,
    sortOrder: order === "asc" || order === "desc" ? order : base.sortOrder,
    sortField2: DISCOUNT_SORT_OPTIONS.some((o) => o.value === sort2) ? sort2 : "",
    sortOrder2: order2 === "asc" || order2 === "desc" ? order2 : base.sortOrder2,
    subtotalBy: DISCOUNT_SUBTOTAL_OPTIONS.some((o) => o.value === sub) ? sub : base.subtotalBy,
    printHeader: get("print_header") || "",
    printFooter: get("print_footer") || "",
    logoAssetId: (() => {
      const v = get("logo_asset_id");
      const n = Number(v);
      return v && Number.isFinite(n) ? n : null;
    })(),
    columnVisibility: (() => {
      const raw = get("columns");
      if (!raw) return base.columnVisibility;
      const keys = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
      const vis = defaultDiscountColumnVisibility();
      for (const col of DISCOUNT_STATUS_COLUMNS) {
        vis[col.key as DiscountColumnKey] = keys.has(col.key);
      }
      return vis;
    })(),
  };
  if (get("report_template") && !get("display_apvl_line") && !get("view_as_graph")) {
    const fromPreset = DISCOUNT_REPORT_PRESET_FLAGS[validPreset];
    return { ...parsed, ...fromPreset, appliedPresetId: validPreset };
  }
  return parsed;
}

const DISCOUNT_REPORT_PRESET_FLAGS: Record<DiscountReportPresetId, Pick<SalesDiscountStatusTemplate, "displayApvlLine" | "viewAsGraph">> = {
  default: { displayApvlLine: false, viewAsGraph: false },
  with_apvl: { displayApvlLine: true, viewAsGraph: false },
  graph: { displayApvlLine: false, viewAsGraph: true },
  apvl_graph: { displayApvlLine: true, viewAsGraph: true },
};

export function formatApvlLine(row: { approval_line?: string; progress_status?: string }): string {
  if (row.approval_line?.trim()) return row.approval_line.trim();
  switch (row.progress_status) {
    case "completed": return "Completed";
    case "unconfirmed": return "Unconfirmed";
    default: return row.progress_status ? row.progress_status.replaceAll("_", " ") : "—";
  }
}
