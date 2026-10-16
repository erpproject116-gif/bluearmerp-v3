/** Same rule as api/internal/platform/openlines.SingleDocumentID. */
export function oneSlipDocument(ids: Array<number | null | undefined>): boolean {
  const seen = new Set<number>();
  for (const id of ids) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) continue;
    seen.add(n);
  }
  return seen.size === 1;
}

export function slipLineSummary(openCount: number, sourceCount: number, skipped: number): string {
  const base = `${openCount} of ${sourceCount} still open`;
  if (skipped > 0) return `${base} · ${skipped} without an inventory item`;
  return base;
}

export function checkedDocumentLines<T>(
  docs: Array<{ id: number; skipped_no_item_count: number; lines: T[] }>,
  selected: Set<number>,
  unchecked: Set<number>,
  lineId: (line: T) => number,
): { lines: T[]; skipped: number } | null {
  const active = docs.filter((doc) => {
    if (!selected.has(doc.id)) return false;
    return doc.lines.some((line) => !unchecked.has(lineId(line)));
  });
  if (active.length !== 1) return null;
  const doc = active[0];
  const lines = doc.lines.filter((line) => !unchecked.has(lineId(line)));
  if (lines.length === 0) return null;
  return { lines, skipped: doc.skipped_no_item_count };
}
