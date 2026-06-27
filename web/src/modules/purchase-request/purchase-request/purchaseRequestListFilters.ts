export type PurchaseRequestListFilters = {
  date_from: string;
  date_to: string;
  location_id?: number | null;
  project_id?: number | null;
  partner_id?: number | null;
  item_id?: number | null;
  progress_status?: string;
  purchase_request_no?: string;
  domestic_foreign?: "domestic" | "foreign" | "all";
  send_status?: "all" | "unsent" | "sent";
  sort_by_modified?: boolean;
  q?: string;
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultListFilters(): PurchaseRequestListFilters {
  const { from, to } = thisMonthRange();
  return {
    date_from: from,
    date_to: to,
    domestic_foreign: "all",
    send_status: "all",
    sort_by_modified: false,
  };
}

export function listFiltersToSearchParams(
  filters: PurchaseRequestListFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.q) qs.set("q", filters.q);
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.item_id) qs.set("item_id", String(filters.item_id));
  if (filters.progress_status) qs.set("progress_status", filters.progress_status);
  if (filters.purchase_request_no?.trim()) qs.set("purchase_request_no", filters.purchase_request_no.trim());
  if (filters.domestic_foreign && filters.domestic_foreign !== "all") {
    qs.set("domestic_foreign", filters.domestic_foreign);
  }
  if (filters.send_status && filters.send_status !== "all") {
    qs.set("send_status", filters.send_status);
  }
  if (filters.sort_by_modified) qs.set("sort_by_modified", "true");
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}
