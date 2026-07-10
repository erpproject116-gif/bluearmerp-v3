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

function summarizeRfqLines(lines: Array<{ confidence?: number; match_score?: number; item_id?: number | null; item_code?: string; qty?: string }>) {
  const conf = lines.map((l) => l.confidence ?? 0.5);
  const match = lines.map((l) => l.match_score ?? 0);
  const matched = lines.filter((l) => l.item_id != null).length;
  const lowConf = lines.filter((l) => (l.confidence ?? 0.5) < 0.65).length;
  const lowMatch = lines.filter((l) => l.item_id != null && (l.match_score ?? 0) < 0.7).length;
  const emptyQty = lines.filter((l) => !l.qty?.trim() || l.qty === "1").length;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    total: lines.length,
    matched,
    unmatched: lines.length - matched,
    avgConfidence: Math.round(avg(conf) * 100) / 100,
    avgMatchScore: Math.round(avg(match) * 100) / 100,
    lowConfidence: lowConf,
    weakMatch: lowMatch,
    defaultQty: emptyQty,
  };
}

// #region agent log
function rfqDbgLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a1498a" },
    body: JSON.stringify({ sessionId: "a1498a", runId: "rfq-baseline", hypothesisId, location, message, data, timestamp: Date.now() }),
  }).catch(() => {});
}
// #endregion

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

  // #region agent log
  rfqDbgLog("H2", "rfqImportPipeline.ts:parse", "parse batch complete", {
    rawLines: mergedLines.length,
    dedupedLines: deduped.length,
    dedupRemoved: mergedLines.length - deduped.length,
    tableDetected,
    columnCount: detectedColumns.length,
    columns: detectedColumns.map((c) => c.field),
    ...summarizeRfqLines(deduped),
  });
  // #endregion

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
    // #region agent log
    if (!matchRes.success) {
      rfqDbgLog("H4", "rfqImportPipeline.ts:match", "match API failed", {
        batch: i + 1,
        message: matchRes.message ?? "unknown",
        lineCount: batches[i].length,
      });
    }
    // #endregion
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

  // #region agent log
  rfqDbgLog("H3", "rfqImportPipeline.ts:match", "match complete", {
    partnerId,
    ...summarizeRfqLines(out),
  });
  // #endregion

  return out.map((ln, idx) => ({ ...ln, line_no: idx + 1 }));
}
