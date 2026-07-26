// Capture RFQ parse payloads for golden corpus fixtures.
//
// Mirrors the client extraction in src/modules/quotation/quotation/rfqDocumentOcr.ts
// (extractPdfWords + mergeNearbyWords + wordsToPlainText) and
// rfqSpreadsheetImport.ts (gridToStructuredTable) so the saved JSON matches what
// the browser posts to /api/v1/quotation/rfq-import/*.
//
// Usage:
//   node scripts/capture-rfq-payload.mjs <file.pdf|file.xls|file.xlsx|file.csv> [outDir]
//
// Output: <outDir>/<basename>.rfq-payload.json  (default outDir = cwd)
//
// Note: scanned PDFs with no text layer produce empty words; the app runs
// browser OCR for those — use the in-app "Export parse payload" button instead.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [, , inputPath, outDirArg] = process.argv;
if (!inputPath) {
  console.error("usage: node scripts/capture-rfq-payload.mjs <file> [outDir]");
  process.exit(1);
}
const outDir = resolve(outDirArg ?? ".");
mkdirSync(outDir, { recursive: true });

// ── mirrors rfqDocumentOcr.ts ────────────────────────────────────────────────

function mergeNearbyWords(words) {
  if (words.length < 2) return words;
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const avgH = sorted.reduce((s, w) => s + (w.h || 10), 0) / sorted.length;
  const rowTol = Math.max(6, avgH * 0.55);
  const gapTol = Math.max(4, avgH * 0.35);
  const out = [];
  for (const w of sorted) {
    const t = w.text.trim();
    if (!t) continue;
    const word = { ...w, text: t };
    const last = out[out.length - 1];
    if (last) {
      const sameRow = Math.abs(word.y - last.y) <= rowTol;
      const gap = word.x - (last.x + last.w);
      if (sameRow && gap >= -1 && gap <= gapTol) {
        last.text = gap > Math.max(3, gapTol * 0.6) ? `${last.text} ${word.text}` : `${last.text}${word.text}`;
        last.w = word.x + word.w - last.x;
        last.h = Math.max(last.h, word.h);
        continue;
      }
    }
    out.push(word);
  }
  return out;
}

function wordsToPlainText(words) {
  if (!words.length) return "";
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let row = [];
  let rowY = sorted[0].y;
  const rowTol = Math.max(4, sorted[0].h * 0.6);
  const flush = () => {
    if (!row.length) return;
    row.sort((a, b) => a.x - b.x);
    lines.push(row.map((w) => w.text).join(" "));
    row = [];
  };
  for (const w of sorted) {
    if (Math.abs(w.y - rowY) > rowTol) {
      flush();
      rowY = w.y;
    }
    row.push(w);
  }
  flush();
  return lines.join("\n");
}

async function extractPdfPayload(path) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const pageH = viewport.height;
    const raw = [];
    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tx = item.transform;
      raw.push({
        text: item.str.trim(),
        x: tx[4],
        y: pageH - tx[5] - (item.height ?? 10),
        w: Math.max(1, item.width ?? 10),
        h: Math.max(1, item.height ?? 10),
      });
    }
    const words = mergeNearbyWords(raw);
    pages.push({
      page: i,
      text: wordsToPlainText(words),
      words,
      width: viewport.width,
      height: viewport.height,
      source_pdf_page: i,
      source_file_index: 0,
    });
  }
  return { pages, tables: [] };
}

// ── mirrors rfqSpreadsheetImport.ts ──────────────────────────────────────────

const HEADER_HINTS =
  /item|qty|quantity|description|spec|specification|unit|price|cost|amount|total|remarks|code|sku|part|uom|no\.?|boq|brand|model|budget|reference\s*price|line\s*total|bill\s+of\s+quantities|schedule\s+of\s+requirements/i;
const FOOTER_ROW =
  /^(grand\s+total|sub\s*total|subtotal|total\s+amount|total\s*:?|amount\s+due|prepared|approved|signature|vat|tax\s+total|net\s+total)/i;

const cellStr = (v) => (v == null ? "" : String(v).trim());
const rowFilledCount = (row) => row.filter((c) => c.trim() !== "").length;

function normalizeHeaderLabel(label, index) {
  const t = label.trim();
  if (!t) return t;
  if (/^column\s*\d+$/i.test(t)) {
    if (index === 0) return "Item";
    if (index === 1) return "Quantity";
  }
  return t;
}

function findHeaderRowIndex(grid) {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(grid.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = grid[i].map(cellStr);
    const filled = rowFilledCount(row);
    if (filled < 2) continue;
    let hits = 0;
    for (const cell of row) if (HEADER_HINTS.test(cell)) hits++;
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

function trimGrid(grid) {
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

function isFooterRow(cells) {
  const joined = cells.map(cellStr).join(" ").trim();
  if (!joined) return true;
  return FOOTER_ROW.test(joined);
}

function isDataRow(cells) {
  const filled = rowFilledCount(cells);
  if (filled === 0) return false;
  const joined = cells.join(" ").trim();
  if (FOOTER_ROW.test(joined)) return false;
  if (filled === 1 && joined.length > 80) return false;
  if (filled < 2 && joined.length > 50 && !/\d/.test(joined)) return false;
  return true;
}

function gridToStructuredTable(grid, page, sheet) {
  const trimmed = trimGrid(grid.map((r) => r.map(cellStr)));
  if (!trimmed.length) return null;
  const headerIdx = findHeaderRowIndex(trimmed);
  if (headerIdx < 0) return null;
  const headers = trimmed[headerIdx].map((h, i) => normalizeHeaderLabel(h, i));
  if (rowFilledCount(headers) < 2) return null;
  const rows = [];
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

async function extractSpreadsheetPayload(path) {
  const XLSX = await import("xlsx");
  const lower = path.toLowerCase();
  const wb = lower.endsWith(".csv")
    ? XLSX.read(readFileSync(path, "utf8"), { type: "string" })
    : XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const tables = [];
  let page = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    const stringGrid = grid.map((row) => (Array.isArray(row) ? row.map(cellStr) : []));
    page += 1;
    const table = gridToStructuredTable(stringGrid, page, sheetName);
    if (table) tables.push(table);
  }
  return { pages: [], tables };
}

// ── main ─────────────────────────────────────────────────────────────────────

const lower = inputPath.toLowerCase();
const isSheet = lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");
const payload = isSheet ? await extractSpreadsheetPayload(inputPath) : await extractPdfPayload(inputPath);

const out = {
  captured_at: new Date().toISOString(),
  files: [basename(inputPath)],
  ...payload,
};
const outPath = join(outDir, `${basename(inputPath).replace(/\.[^.]+$/, "")}.rfq-payload.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  `${outPath}: ${out.pages.length} page(s), ${out.tables.length} table(s), ` +
    `${out.pages.reduce((s, p) => s + p.words.length, 0)} words`,
);
