import { apiFetch } from "../../../shared/api";
import type { RfqDocumentPayload } from "./rfqDocumentOcr";
import type { RfqDetectedColumn, RfqParsedLine } from "./RfqImportModal";

export const RFQ_PARSE_PAGE_CHUNK = 12;
export const RFQ_MATCH_LINE_CHUNK = 75;
export const RFQ_LARGE_DOC_PAGE_WARN = 50;
/** Browser PDF/OCR extraction up to this many pages. */
export const RFQ_CLIENT_OCR_PAGE_MAX = 150;
/** Server-side text PDF extraction (151–400 pages). */
export const RFQ_SERVER_PDF_PAGE_MIN = 151;
export const RFQ_SERVER_PDF_PAGE_MAX = 400;

type ParseApiLine = Omit<RfqParsedLine, "include">;

type ParseBatchResult = {
  lines: ParseApiLine[];
  table_detected: boolean;
  detected_columns: RfqDetectedColumn[];
};

export type RfqImportProgress = {
  phase: "parse" | "match";
  batch: number;
  totalBatches: number;
  message: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function parseBatch(
  pages: RfqDocumentPayload["pages"],
  tables: RfqDocumentPayload["tables"],
  force?: string[],
): Promise<ParseBatchResult> {
  const res = await apiFetch<{
    lines: ParseApiLine[];
    table_detected?: boolean;
    detected_columns?: RfqDetectedColumn[];
  }>("/api/v1/quotation/rfq-import/parse", {
    method: "POST",
    body: JSON.stringify({
      pages,
      tables,
      force_columns: force?.filter(Boolean).length && force.filter(Boolean).length >= 2 ? force : undefined,
    }),
  });
  if (!res.success || !res.data?.lines) {
    throw new Error(res.message ?? "Failed to parse RFQ batch.");
  }
  return {
    lines: res.data.lines,
    table_detected: !!res.data.table_detected,
    detected_columns: res.data.detected_columns ?? [],
  };
}

export async function parsePayloadInBatches(
  payload: RfqDocumentPayload,
  force: string[],
  onProgress?: (p: RfqImportProgress) => void,
): Promise<{ lines: ParseApiLine[]; table_detected: boolean; detected_columns: RfqDetectedColumn[]; force_columns: string[] }> {
  const pageChunks = payload.pages.length ? chunk(payload.pages, RFQ_PARSE_PAGE_CHUNK) : [];
  const tableChunks = payload.tables.length ? chunk(payload.tables, RFQ_PARSE_PAGE_CHUNK) : [];
  const totalBatches = Math.max(pageChunks.length, tableChunks.length, 1);

  let mergedLines: ParseApiLine[] = [];
  let tableDetected = false;
  let detectedColumns: RfqDetectedColumn[] = [];
  let activeForce = force.filter(Boolean).length >= 2 ? [...force] : [];

  for (let i = 0; i < totalBatches; i++) {
    onProgress?.({
      phase: "parse",
      batch: i + 1,
      totalBatches,
      message: `Parsing batch ${i + 1} of ${totalBatches}…`,
    });
    const batch = await parseBatch(
      pageChunks[i] ?? [],
      tableChunks[i] ?? [],
      activeForce.length >= 2 ? activeForce : undefined,
    );
    mergedLines = mergedLines.concat(batch.lines);
    if (batch.table_detected) tableDetected = true;
    if (!detectedColumns.length && batch.detected_columns.length) {
      detectedColumns = batch.detected_columns;
      if (activeForce.length < 2) {
        activeForce = batch.detected_columns.map((c) => c.field);
      }
    }
  }

  const seen = new Set<string>();
  const deduped: ParseApiLine[] = [];
  for (const ln of mergedLines) {
    const key = `${ln.item_code}|${ln.description}|${ln.qty}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ln);
  }

  return {
    lines: deduped.map((ln, idx) => ({ ...ln, line_no: idx + 1 })),
    table_detected: tableDetected,
    detected_columns: detectedColumns,
    force_columns: activeForce,
  };
}

export async function matchLinesInBatches(
  parsed: ParseApiLine[],
  partnerId: number | null,
  onProgress?: (p: RfqImportProgress) => void,
): Promise<RfqParsedLine[]> {
  const batches = chunk(parsed, RFQ_MATCH_LINE_CHUNK);
  const out: RfqParsedLine[] = [];

  for (let i = 0; i < batches.length; i++) {
    onProgress?.({
      phase: "match",
      batch: i + 1,
      totalBatches: batches.length,
      message: `Matching inventory batch ${i + 1} of ${batches.length}…`,
    });
    const matchRes = await apiFetch<{ lines: RfqParsedLine[] }>("/api/v1/quotation/rfq-import/match-items", {
      method: "POST",
      body: JSON.stringify({
        lines: batches[i],
        partner_id: partnerId ?? undefined,
      }),
    });
    const batchLines = (matchRes.data?.lines ?? batches[i]).map((ln) => ({
      ...ln,
      item_code: ln.item_code ?? "",
      description: ln.description ?? ln.item_name ?? "",
      qty: ln.qty || "1",
      unit: ln.unit ?? "",
      unit_price: ln.unit_price ?? "",
      line_total: ln.line_total ?? "",
      remarks: ln.remarks ?? "",
      confidence: ln.confidence ?? 0.5,
      include: true,
    }));
    out.push(...batchLines);
  }

  return out.map((ln, idx) => ({ ...ln, line_no: idx + 1 }));
}
