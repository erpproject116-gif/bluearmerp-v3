import * as XLSX from "xlsx";

export type RfqStructuredTable = {
  page: number;
  sheet?: string;
  headers: string[];
  rows: string[][];
};

const HEADER_HINTS =
  /item|qty|quantity|description|spec|unit|price|cost|amount|total|remarks|code|sku|part|uom|no\.?/i;

const FOOTER_ROW =
  /^(grand\s+total|sub\s*total|subtotal|total\s+amount|total\s*:?|amount\s+due|prepared|approved|signature|vat|tax\s+total|net\s+total)/i;

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

function rowFilledCount(row: string[]): number {
  return row.filter((c) => c.trim() !== "").length;
}

function normalizeHeaderLabel(label: string, index: number): string {
  const t = label.trim();
  if (!t) return t;
  if (/^column\s*\d+$/i.test(t)) {
    if (index === 0) return "Item";
    if (index === 1) return "Quantity";
  }
  return t;
}

function findHeaderRowIndex(grid: string[][]): number {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(grid.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = grid[i].map(cellStr);
    const filled = rowFilledCount(row);
    if (filled < 2) continue;
    let hits = 0;
    for (const cell of row) {
      if (HEADER_HINTS.test(cell)) hits++;
    }
    const score = hits * 10 + filled;
    if (score > bestScore && (hits >= 1 || filled >= 3)) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return bestIdx;
  for (let i = 0; i < limit; i++) {
    if (rowFilledCount(grid[i].map(cellStr)) >= 2) return i;
  }
  return -1;
}

function trimGrid(grid: string[][]): string[][] {
  let maxCol = 0;
  for (const row of grid) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (cellStr(row[c])) {
        maxCol = Math.max(maxCol, c + 1);
        break;
      }
    }
  }
  return grid.map((row) => {
    const out = row.slice(0, maxCol).map(cellStr);
    while (out.length < maxCol) out.push("");
    return out;
  });
}

function isFooterRow(cells: string[]): boolean {
  const joined = cells.map(cellStr).join(" ").trim();
  if (!joined) return true;
  return FOOTER_ROW.test(joined);
}

function isDataRow(cells: string[]): boolean {
  const filled = rowFilledCount(cells);
  if (filled === 0) return false;
  const joined = cells.join(" ").trim();
  if (FOOTER_ROW.test(joined)) return false;
  if (filled === 1 && joined.length > 80) return false;
  return true;
}

export function gridToStructuredTable(
  grid: string[][],
  page: number,
  sheet?: string,
): RfqStructuredTable | null {
  const trimmed = trimGrid(grid.map((r) => r.map(cellStr)));
  if (!trimmed.length) return null;

  const headerIdx = findHeaderRowIndex(trimmed);
  if (headerIdx < 0) return null;

  const headers = trimmed[headerIdx].map((h, i) => normalizeHeaderLabel(h, i));
  if (rowFilledCount(headers) < 2) return null;

  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < trimmed.length; i++) {
    const row = trimmed[i];
    if (!isDataRow(row)) {
      if (rows.length > 0 && isFooterRow(row)) break;
      continue;
    }
    const normalized = headers.map((_, ci) => cellStr(row[ci] ?? ""));
    if (rowFilledCount(normalized) === 0) continue;
    rows.push(normalized);
  }

  if (!rows.length) return null;
  return { page, sheet, headers, rows };
}

function workbookToTables(wb: XLSX.WorkBook, pageOffset = 0): RfqStructuredTable[] {
  const tables: RfqStructuredTable[] = [];
  let page = pageOffset;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const stringGrid = grid.map((row) => (Array.isArray(row) ? row.map(cellStr) : []));
    page += 1;
    const table = gridToStructuredTable(stringGrid, page, sheetName);
    if (table) tables.push(table);
  }
  return tables;
}

export async function extractSpreadsheetTables(file: File, pageOffset = 0): Promise<RfqStructuredTable[]> {
  const buf = await file.arrayBuffer();
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv") || file.type === "text/csv") {
    const text = new TextDecoder("utf-8").decode(buf);
    const wb = XLSX.read(text, { type: "string" });
    return workbookToTables(wb, pageOffset);
  }

  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return workbookToTables(wb, pageOffset);
}

export function isSpreadsheetFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}
