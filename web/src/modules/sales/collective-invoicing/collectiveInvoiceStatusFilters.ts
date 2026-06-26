export type CollectiveInvoiceStatusFilters = {
  date_from: string;
  date_to: string;
  accounting_slip_no: string;
  department_ids: number[];
  tax_type_ids: number[];
  project_ids: number[];
  pic_user_ids: number[];
  partner_ids: number[];
  status: "all" | "e_approval" | "unconfirmed" | "confirmed";
  tax_entity: boolean;
};

export type SelectedItem = { id: number; label: string };

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultCollectiveInvoiceStatusFilters(): CollectiveInvoiceStatusFilters {
  const { from, to } = thisMonthRange();
  return {
    date_from: from,
    date_to: to,
    accounting_slip_no: "",
    department_ids: [],
    tax_type_ids: [],
    project_ids: [],
    pic_user_ids: [],
    partner_ids: [],
    status: "all",
    tax_entity: false,
  };
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function filtersToSearchParams(
  filters: CollectiveInvoiceStatusFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string; sort2?: string; order2?: string },
): string {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.accounting_slip_no.trim()) qs.set("accounting_slip_no", filters.accounting_slip_no.trim());
  if (filters.department_ids.length) qs.set("department_ids", filters.department_ids.join(","));
  if (filters.tax_type_ids.length) qs.set("tax_type_ids", filters.tax_type_ids.join(","));
  if (filters.project_ids.length) qs.set("project_ids", filters.project_ids.join(","));
  if (filters.pic_user_ids.length) qs.set("pic_user_ids", filters.pic_user_ids.join(","));
  if (filters.partner_ids.length) qs.set("partner_ids", filters.partner_ids.join(","));
  if (filters.status !== "all") qs.set("status", filters.status);
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  if (extra?.sort2) qs.set("sort2", extra.sort2);
  if (extra?.order2) qs.set("order2", extra.order2);
  return qs.toString();
}

export function parseCollectiveInvoiceStatusFiltersFromSearch(
  params: Record<string, string | string[]>,
): CollectiveInvoiceStatusFilters {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const parseIds = (k: string) => {
    const raw = get(k);
    if (!raw) return [];
    return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  };
  const base = defaultCollectiveInvoiceStatusFilters();
  const status = get("status") as CollectiveInvoiceStatusFilters["status"];
  const validStatus = ["all", "e_approval", "unconfirmed", "confirmed"].includes(status) ? status : "all";
  return {
    date_from: get("date_from") || base.date_from,
    date_to: get("date_to") || base.date_to,
    accounting_slip_no: get("accounting_slip_no") || "",
    department_ids: parseIds("department_ids"),
    tax_type_ids: parseIds("tax_type_ids"),
    project_ids: parseIds("project_ids"),
    pic_user_ids: parseIds("pic_user_ids"),
    partner_ids: parseIds("partner_ids"),
    status: validStatus,
    tax_entity: get("tax_entity") === "1",
  };
}
