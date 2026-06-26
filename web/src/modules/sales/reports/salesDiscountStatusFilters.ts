export type SalesDiscountStatusFilters = {
  date_from: string;
  date_to: string;
  tax_type_ids: number[];
  location_ids: number[];
  location_types: string[];
  project_ids: number[];
  pic_user_ids: number[];
  partner_ids: number[];
  discount_from?: number | null;
  discount_to?: number | null;
  remark?: string;
};

export type SelectedItem = { id: number; label: string };
export type SelectedLocationType = { value: string; label: string };

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultDiscountStatusFilters(): SalesDiscountStatusFilters {
  const { from, to } = thisMonthRange();
  return {
    date_from: from,
    date_to: to,
    tax_type_ids: [],
    location_ids: [],
    location_types: [],
    project_ids: [],
    pic_user_ids: [],
    partner_ids: [],
    discount_from: null,
    discount_to: null,
    remark: "",
  };
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function filtersToSearchParams(
  filters: SalesDiscountStatusFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string; sort2?: string; order2?: string },
): URLSearchParams {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.tax_type_ids.length) qs.set("tax_type_ids", filters.tax_type_ids.join(","));
  if (filters.location_ids.length) qs.set("location_ids", filters.location_ids.join(","));
  if (filters.location_types.length) qs.set("location_types", filters.location_types.join(","));
  if (filters.project_ids.length) qs.set("project_ids", filters.project_ids.join(","));
  if (filters.pic_user_ids.length) qs.set("pic_user_ids", filters.pic_user_ids.join(","));
  if (filters.partner_ids.length) qs.set("partner_ids", filters.partner_ids.join(","));
  if (filters.discount_from != null) qs.set("discount_from", String(filters.discount_from));
  if (filters.discount_to != null) qs.set("discount_to", String(filters.discount_to));
  if (filters.remark?.trim()) qs.set("remark", filters.remark.trim());
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  if (extra?.sort2) qs.set("sort2", extra.sort2);
  if (extra?.order2) qs.set("order2", extra.order2);
  return qs;
}

export function discountStatusExportUrl(
  filters: SalesDiscountStatusFilters,
  extra?: { sort?: string; order?: string; sort2?: string; order2?: string },
): string {
  return `/api/v1/sales/discount-status-report/export?${filtersToSearchParams(filters, extra).toString()}`;
}

export const LOCATION_TYPE_GROUPS: SelectedLocationType[] = [
  { value: "location", label: "Location" },
  { value: "factory", label: "Factory" },
  { value: "factory_oe_manage", label: "Factory (OE Manage)" },
];

export function parseDiscountStatusFiltersFromSearch(params: Record<string, string | string[]>): SalesDiscountStatusFilters {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const parseIds = (k: string) => {
    const raw = get(k);
    if (!raw) return [];
    return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  };
  const parseTypes = (k: string) => {
    const raw = get(k);
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };
  const num = (k: string) => {
    const v = get(k);
    const n = Number(v);
    return v && Number.isFinite(n) ? n : null;
  };
  const base = defaultDiscountStatusFilters();
  return {
    date_from: get("date_from") || base.date_from,
    date_to: get("date_to") || base.date_to,
    tax_type_ids: parseIds("tax_type_ids"),
    location_ids: parseIds("location_ids"),
    location_types: parseTypes("location_types"),
    project_ids: parseIds("project_ids"),
    pic_user_ids: parseIds("pic_user_ids"),
    partner_ids: parseIds("partner_ids"),
    discount_from: num("discount_from"),
    discount_to: num("discount_to"),
    remark: get("remark") || "",
  };
}
