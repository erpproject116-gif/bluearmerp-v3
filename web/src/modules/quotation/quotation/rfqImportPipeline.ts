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

export type RfqAiConfig = {
  enabled: boolean;
  provider?: string;
  model?: string;
  text_model: string;
  vision_model: string;
  max_pages: number;
};

type ParseApiLine = Omit<RfqParsedLine, "include">;

type ParseBatchResult = {
  lines: ParseApiLine[];
  table_detected: boolean;
  detected_columns: RfqDetectedColumn[];
  document_type: RfqDocumentType;
  blocked: boolean;
  blocked_reason?: string;
};

export type RfqDocumentType =
  | "unknown"
  | "rfq"
  | "gov_section_spec"
  | "gov_annex_table"
  | "spreadsheet_boq"
  | "spec_sheet"
  | "invoice_like";

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
    document_type?: RfqDocumentType;
    blocked?: boolean;
    blocked_reason?: string;
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
    document_type: res.data.document_type ?? "unknown",
    blocked: !!res.data.blocked,
    blocked_reason: res.data.blocked_reason,
  };
}

export async function parsePayloadInBatches(
  payload: RfqDocumentPayload,
  force: string[],
  onProgress?: (p: RfqImportProgress) => void,
): Promise<{
  lines: ParseApiLine[];
  table_detected: boolean;
  detected_columns: RfqDetectedColumn[];
  force_columns: string[];
  document_type: RfqDocumentType;
  blocked: boolean;
  blocked_reason?: string;
}> {
  const pageChunks = payload.pages.length ? chunk(payload.pages, RFQ_PARSE_PAGE_CHUNK) : [];
  const tableChunks = payload.tables.length ? chunk(payload.tables, RFQ_PARSE_PAGE_CHUNK) : [];
  const totalBatches = Math.max(pageChunks.length, tableChunks.length, 1);

  let mergedLines: ParseApiLine[] = [];
  let tableDetected = false;
  let detectedColumns: RfqDetectedColumn[] = [];
  let activeForce = force.filter(Boolean).length >= 2 ? [...force] : [];
  let documentType: RfqDocumentType = "unknown";
  let blocked = false;
  let blockedReason: string | undefined;
  const typePriority: Record<RfqDocumentType, number> = {
    unknown: 0,
    rfq: 1,
    spreadsheet_boq: 2,
    gov_annex_table: 3,
    gov_section_spec: 4,
    spec_sheet: 5,
    invoice_like: 6,
  };

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
    if (typePriority[batch.document_type] > typePriority[documentType]) {
      documentType = batch.document_type;
    }
    if (batch.blocked) {
      blocked = true;
      blockedReason = batch.blocked_reason;
    }
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
    document_type: documentType,
    blocked,
    blocked_reason: blockedReason,
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

let rfqAiConfigCache: RfqAiConfig | null | undefined;

export async function fetchRfqAiConfig(): Promise<RfqAiConfig | null> {
  if (rfqAiConfigCache !== undefined) return rfqAiConfigCache;
  try {
    const res = await apiFetch<RfqAiConfig>("/api/v1/quotation/rfq-import/ai-config");
    if (!res.success || !res.data?.enabled) {
      rfqAiConfigCache = null;
      return null;
    }
    rfqAiConfigCache = res.data;
    return res.data;
  } catch {
    rfqAiConfigCache = null;
    return null;
  }
}

export function rfqParseNeedsAiEnhancement(
  lines: Array<{ description?: string; confidence?: number }>,
  tableDetected: boolean,
): boolean {
  if (!lines.length) return true;
  if (!tableDetected) return true;
  const weak = lines.filter((l) => !l.description?.trim() || (l.confidence ?? 0.5) < 0.65).length;
  return weak / lines.length > 0.4;
}

export async function aiParsePayload(
  payload: RfqDocumentPayload,
  pageImages: Array<{ page: number; image_base64: string; mime: string }>,
  onProgress?: (p: RfqImportProgress) => void,
): Promise<{
  lines: ParseApiLine[];
  table_detected: boolean;
  detected_columns: RfqDetectedColumn[];
  ai_model?: string;
  pages_truncated: number;
  document_type: RfqDocumentType;
}> {
  onProgress?.({
    phase: "parse",
    batch: 1,
    totalBatches: 1,
    message: "Sending pages to AI for line-item extraction…",
  });

  const res = await apiFetch<{
    lines: ParseApiLine[];
    table_detected?: boolean;
    detected_columns?: RfqDetectedColumn[];
    ai_model?: string;
    pages_truncated?: number;
    document_type?: RfqDocumentType;
  }>("/api/v1/quotation/rfq-import/ai-parse", {
    method: "POST",
    body: JSON.stringify({
      pages: payload.pages.map((p) => ({
        page: p.page,
        text: p.text,
        words: p.words,
        width: p.width,
        height: p.height,
        source_pdf_page: p.source_pdf_page,
        source_file_index: p.source_file_index,
      })),
      tables: payload.tables,
      page_images: pageImages,
    }),
  });

  if (!res.success || !res.data?.lines?.length) {
    throw new Error(res.message ?? "AI extraction returned no line items.");
  }

  return {
    lines: res.data.lines.map((ln, idx) => ({ ...ln, line_no: idx + 1 })),
    table_detected: !!res.data.table_detected,
    detected_columns: res.data.detected_columns ?? [],
    ai_model: res.data.ai_model,
    pages_truncated: res.data.pages_truncated ?? 0,
    document_type: res.data.document_type ?? "unknown",
  };
}
