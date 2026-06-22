export type ReceiptStatusFilters = {
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
  receipt_status?: string;
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultReceiptStatusFilters(): ReceiptStatusFilters {
  const { from, to } = thisMonthRange();
  return { date_from: from, date_to: to };
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function receiptStatusLabel(status: string): string {
  if (status === "full") return "Full";
  if (status === "partial") return "Partial";
  if (status === "none") return "None";
  return status;
}
