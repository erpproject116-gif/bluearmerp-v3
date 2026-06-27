export type PurchaseRequestStatusFilters = {
  date_from: string;
  date_to: string;
  location_id?: number | null;
  project_id?: number | null;
  partner_id?: number | null;
  item_id?: number | null;
  domestic_foreign?: "domestic" | "foreign" | "all";
  send_status?: "all" | "unsent" | "sent";
  progress_status?: string;
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

export function defaultStatusFilters(): PurchaseRequestStatusFilters {
  const { from, to } = thisMonthRange();
  return { date_from: from, date_to: to, domestic_foreign: "all", send_status: "all" };
}

export function filtersToSearchParams(
  filters: PurchaseRequestStatusFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.item_id) qs.set("item_id", String(filters.item_id));
  if (filters.domestic_foreign && filters.domestic_foreign !== "all") {
    qs.set("domestic_foreign", filters.domestic_foreign);
  }
  if (filters.send_status && filters.send_status !== "all") {
    qs.set("send_status", filters.send_status);
  }
  if (filters.progress_status) qs.set("progress_status", filters.progress_status);
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function statusPrintPath(filters: PurchaseRequestStatusFilters): string {
  return `/app/purchase-request/purchase-requests/status/print?${filtersToSearchParams(filters).toString()}`;
}

export function statusExportUrl(filters: PurchaseRequestStatusFilters): string {
  return `/api/v1/purchase-request/purchase-requests/status-report/export?${filtersToSearchParams(filters).toString()}`;
}
