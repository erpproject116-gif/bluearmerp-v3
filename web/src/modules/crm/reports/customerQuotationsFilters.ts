export type CustomerQuotationsFilters = {
  item_id?: number | null;
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
};

export function defaultCustomerQuotationsFilters(): CustomerQuotationsFilters {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}
