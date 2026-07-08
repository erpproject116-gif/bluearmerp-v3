export type PartnerBookType = "ar" | "ap";

export type PartnerBookFilters = {
  book_type: PartnerBookType;
  date_from: string;
  date_to: string;
  partner_id?: number | null;
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultPartnerBookFilters(bookType: PartnerBookType): PartnerBookFilters {
  const { from, to } = thisMonthRange();
  return { book_type: bookType, date_from: from, date_to: to };
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function partnerBookExportUrl(filters: PartnerBookFilters): string {
  const qs = new URLSearchParams({
    book_type: filters.book_type,
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  return `/api/v1/finance/customer-vendor-book/export?${qs}`;
}
