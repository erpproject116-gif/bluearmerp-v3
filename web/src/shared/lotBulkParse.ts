/** One lot row from bulk paste (lot no., qty, optional expiry, optional catch-weight). */
export type LotBulkRow = {
  lot_no: string;
  qty: number;
  expiry_date?: string | null;
  catch_weight?: number | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseQty(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeExpiry(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (DATE_RE.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Split pasted lines into lot rows (tab/comma columns or one lot no. per line). */
export function parseLotBulkInput(raw: string, defaultQty = 1): LotBulkRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: LotBulkRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[,\t;]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const lotNo = parts[0];
    const qty = parts.length >= 2 ? parseQty(parts[1]) : defaultQty;
    if (!lotNo || qty == null) continue;
    const expiry = parts.length >= 3 ? normalizeExpiry(parts[2]) : null;
    const cw = parts.length >= 4 ? parseQty(parts[3]) : null;
    out.push({ lot_no: lotNo, qty, expiry_date: expiry, catch_weight: cw });
  }
  return out;
}

/** Deduplicate by lot no. (case-insensitive), keeping first row. */
export function dedupeLotRows(rows: LotBulkRow[]): LotBulkRow[] {
  const seen = new Set<string>();
  const out: LotBulkRow[] = [];
  for (const row of rows) {
    const key = row.lot_no.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function formatLotBulkList(rows: LotBulkRow[]): string {
  return rows
    .map((r) => {
      const exp = r.expiry_date ? `\t${r.expiry_date}` : "";
      return `${r.lot_no}\t${r.qty}${exp}`;
    })
    .join("\n");
}

export function parseAndDedupeLotBulkInput(raw: string, defaultQty = 1): LotBulkRow[] {
  return dedupeLotRows(parseLotBulkInput(raw, defaultQty));
}
