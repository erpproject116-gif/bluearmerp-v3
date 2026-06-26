export type OfficialReceiptStatusFilters = {
  date_from: string;
  date_to: string;
  partner_id?: number | null;
  location_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  pic_user_id?: number | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultOfficialReceiptStatusFilters(): OfficialReceiptStatusFilters {
  const { from, to } = thisMonthRange();
  return { date_from: from, date_to: to };
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function filtersToSearchParams(
  filters: OfficialReceiptStatusFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.department_id) qs.set("department_id", String(filters.department_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.pic_user_id) qs.set("pic_user_id", String(filters.pic_user_id));
  if (filters.created_by_user_id) qs.set("created_by_user_id", String(filters.created_by_user_id));
  if (filters.updated_by_user_id) qs.set("updated_by_user_id", String(filters.updated_by_user_id));
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}
