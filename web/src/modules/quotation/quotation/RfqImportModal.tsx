import { createEffect, createSignal, For, Show } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { AlertBanner } from "../../../shared/AlertBanner";
import { QuickItemModal, type CreatedItem } from "../../../shared/QuickItemModal";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { formatMoney } from "../../../shared/money";
import { fileImportKey, type RfqDocumentPayload, type RfqOcrPage, type RfqOcrProgress } from "./rfqDocumentOcr";
import type { RfqStructuredTable, WorkbookSheetInfo } from "./rfqSpreadsheetImport";
import type { QuotationLineRow } from "./QuotationLineGrid";
import { emptyQuotationLine } from "./QuotationLineGrid";
import { rfqParseNeedsAiEnhancement, type RfqDocumentType } from "./rfqImportPipeline";

const unmatchedChipClass =
  "inline-flex rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700";

export type RfqParsedLine = {
  page: number;
  line_no: number;
  item_code: string;
  item_name?: string;
  description: string;
  remarks?: string;
  qty: string;
  unit: string;
  unit_price?: string;
  line_total?: string;
  confidence: number;
  item_id?: number | null;
  unit_id?: number | null;
  unit_code?: string | null;
  sales_price?: number;
  rfq_unit_price?: number;
  match_score?: number;
  alternatives?: RfqItemAlternative[];
  include: boolean;
};

export type RfqItemAlternative = {
  item_id: number;
  item_code: string;
  item_name: string;
  sales_price: number;
  match_score: number;
};

export type RfqDetectedColumn = {
  index: number;
  field: string;
  label: string;
};

const COLUMN_FIELDS = [
  { value: "", label: "— ignore —" },
  { value: "line_no", label: "Line no." },
  { value: "item_code", label: "Item code" },
  { value: "item_name", label: "Item name" },
  { value: "description", label: "Description" },
  { value: "qty", label: "Qty" },
  { value: "unit", label: "Unit" },
  { value: "unit_price", label: "Unit price" },
  { value: "line_total", label: "Line total" },
  { value: "remarks", label: "Remarks" },
] as const;

function confidenceClass(c: number): string {
  if (c >= 0.85) return "text-green-700";
  if (c >= 0.65) return "text-amber-700";
  return "text-red-700";
}

function pickUnitPrice(ln: RfqParsedLine): string {
  if (ln.unit_price?.trim()) return ln.unit_price.trim();
  if (ln.rfq_unit_price && ln.rfq_unit_price > 0) return String(ln.rfq_unit_price);
  if (ln.sales_price && ln.sales_price > 0) return String(ln.sales_price);
  return "";
}

function templateKey(partnerId: number | null | undefined): string | null {
  if (!partnerId) return null;
  return `rfq-column-template-${partnerId}`;
}

function loadSavedForceColumns(partnerId: number | null | undefined): string[] | null {
  const key = templateKey(partnerId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function saveForceColumns(partnerId: number | null | undefined, cols: string[]) {
  const key = templateKey(partnerId);
  if (!key || !cols.some(Boolean)) return;
  localStorage.setItem(key, JSON.stringify(cols));
}

type SheetPickerRow = WorkbookSheetInfo & { selected: boolean };

type SheetPickerGroup = {
  fileKey: string;
  fileName: string;
  sheets: SheetPickerRow[];
};

type Props = {
  open: boolean;
  partnerId?: () => number | null;
  onClose: () => void;
  onApply: (lines: QuotationLineRow[]) => void;
};

export function RfqImportModal(props: Props) {
  const toast = useToast();
  const auth = useAuth();
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal<RfqOcrProgress | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [lines, setLines] = createSignal<RfqParsedLine[]>([]);
  const [sourcePages, setSourcePages] = createSignal<RfqOcrPage[]>([]);
  const [sourceTables, setSourceTables] = createSignal<RfqStructuredTable[]>([]);
  const [tableDetected, setTableDetected] = createSignal(false);
  const [detectedColumns, setDetectedColumns] = createSignal<RfqDetectedColumn[]>([]);
  const [forceColumns, setForceColumns] = createSignal<string[]>([]);
  const [pageFrom, setPageFrom] = createSignal("");
  const [pageTo, setPageTo] = createSignal("");
  const [skippedPageCount, setSkippedPageCount] = createSignal(0);
  const [tableSourceCount, setTableSourceCount] = createSignal(0);
  const [largeDocHint, setLargeDocHint] = createSignal<string | null>(null);
  const [showSheetPicker, setShowSheetPicker] = createSignal(false);
  const [sheetPickerGroups, setSheetPickerGroups] = createSignal<SheetPickerGroup[]>([]);
  const [pendingFiles, setPendingFiles] = createSignal<File[]>([]);
  const [sourceFiles, setSourceFiles] = createSignal<File[]>([]);
  const [aiAvailable, setAiAvailable] = createSignal(false);
  const [aiUsed, setAiUsed] = createSignal(false);
  const [aiModel, setAiModel] = createSignal<string | null>(null);
  const [documentType, setDocumentType] = createSignal<RfqDocumentType>("unknown");
  const [blockedReason, setBlockedReason] = createSignal<string | null>(null);
  const [pagesTruncated, setPagesTruncated] = createSignal(0);
  const [createLineNo, setCreateLineNo] = createSignal<number | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

  const unmatchedCount = () => lines().filter((l) => l.include && !l.item_id).length;
  const createLine = () => lines().find((l) => l.line_no === createLineNo()) ?? null;
  const canCreateItem = () => hasPermission(auth.me, "inventory.items", "write");
  const canExportPayload = () =>
    import.meta.env.DEV || hasPermission(auth.me, "quotation.quotations", "write");

  /** Download the exact payload sent to /rfq-import/* so it can become a golden corpus fixture. */
  const exportParsePayload = () => {
    const pages = sourcePages();
    const tables = sourceTables();
    if (!pages.length && !tables.length) return;
    const fixture = {
      captured_at: new Date().toISOString(),
      files: sourceFiles().map((f) => f.name),
      pages,
      tables,
    };
    const blob = new Blob([JSON.stringify(fixture, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = sourceFiles()[0]?.name.replace(/\.[^.]+$/, "") || "rfq-payload";
    a.href = url;
    a.download = `${base}.rfq-payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  createEffect(() => {
    if (!props.open) return;
    void import("./rfqImportPipeline").then(({ fetchRfqAiConfig }) =>
      fetchRfqAiConfig().then((cfg) => setAiAvailable(!!cfg?.enabled)),
    );
  });

  const parsePageFrom = () => {
    const v = parseInt(pageFrom().trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const parsePageTo = () => {
    const v = parseInt(pageTo().trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const reset = () => {
    setLines([]);
    setSourcePages([]);
    setSourceTables([]);
    setTableDetected(false);
    setDetectedColumns([]);
    setForceColumns([]);
    setPageFrom("");
    setPageTo("");
    setSkippedPageCount(0);
    setTableSourceCount(0);
    setLargeDocHint(null);
    setShowSheetPicker(false);
    setSheetPickerGroups([]);
    setPendingFiles([]);
    setSourceFiles([]);
    setAiUsed(false);
    setAiModel(null);
    setDocumentType("unknown");
    setBlockedReason(null);
    setPagesTruncated(0);
    setProgress(null);
    setError(null);
    if (fileInputRef) fileInputRef.value = "";
  };

  const matchLines = async (parsed: Array<Omit<RfqParsedLine, "include">>) => {
    const { matchLinesInBatches } = await import("./rfqImportPipeline");
    const partnerId = props.partnerId?.() ?? null;
    return matchLinesInBatches(parsed, partnerId, (p) =>
      setProgress({
        phase: "parse",
        page: p.batch,
        totalPages: p.totalBatches,
        message: p.message,
      }),
    );
  };

  const parsePayload = async (payload: RfqDocumentPayload, force: string[]) => {
    const { parsePayloadInBatches } = await import("./rfqImportPipeline");
    const parsed = await parsePayloadInBatches(payload, force, (p) =>
      setProgress({
        phase: "parse",
        page: p.batch,
        totalPages: p.totalBatches,
        message: p.message,
      }),
    );
    setTableDetected(parsed.table_detected);
    setDetectedColumns(parsed.detected_columns);
    setDocumentType(parsed.document_type);
    setBlockedReason(parsed.blocked ? parsed.blocked_reason ?? "This document cannot be imported as an RFQ." : null);
    if (force.filter(Boolean).length >= 2) {
      setForceColumns(force);
    } else if (parsed.force_columns.length) {
      setForceColumns(parsed.force_columns);
    }
    if (parsed.blocked) {
      setLines([]);
      throw new Error(parsed.blocked_reason ?? "This document cannot be imported as an RFQ.");
    }
    if (!parsed.lines.length) {
      setLines([]);
      throw new Error("No line items detected in the table area. Adjust column mapping or try a clearer scan.");
    }
    const matched = await matchLines(parsed.lines);
    setLines(matched);
    return matched.length;
  };

  const runImport = async (files: File[], sheetSelections: Record<string, string[]>) => {
    setBusy(true);
    setError(null);
    setLines([]);
    setShowSheetPicker(false);
    setProgress({ phase: "ocr", page: 0, totalPages: 0, message: "Loading document tools…" });

    try {
      const { RFQ_SERVER_PDF_PAGE_MAX, RFQ_LARGE_DOC_PAGE_WARN } = await import("./rfqImportPipeline");
      const { extractRfqDocumentPayload, getPdfPageCount } = await import("./rfqDocumentOcr");

      let estimatedPages = 0;
      for (const file of files) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          estimatedPages += await getPdfPageCount(file);
        } else {
          estimatedPages += 1;
        }
      }
      const pf = parsePageFrom();
      const pt = parsePageTo();
      const rangeCount = pf || pt ? (pt ?? estimatedPages) - (pf ?? 1) + 1 : estimatedPages;
      if (rangeCount > RFQ_SERVER_PDF_PAGE_MAX) {
        throw new Error(
          `This import has ${rangeCount} pages (max ${RFQ_SERVER_PDF_PAGE_MAX}). Use page range or split the RFQ.`,
        );
      }
      if (rangeCount >= RFQ_LARGE_DOC_PAGE_WARN) {
        const serverNote =
          rangeCount > 150 ? " Pages 151+ are extracted on the server (text PDFs)." : "";
        setLargeDocHint(
          `Large document (${rangeCount} pages): non-table pages are skipped; parsing runs in batches.${serverNote} This may take several minutes.`,
        );
      }

      const payload = await extractRfqDocumentPayload(files, setProgress, {
        pageFrom: pf,
        pageTo: pt,
        filterNonTablePages: true,
        sheetSelections,
      });
      if (!payload.pages.length && !payload.tables.length) {
        setError("No table pages found. Try widening the page range or selecting different Excel sheets.");
        return;
      }
      setSourcePages(payload.pages);
      setSourceTables(payload.tables);
      setSourceFiles(files);
      setAiUsed(false);
      setAiModel(null);
      setDocumentType("unknown");
      setBlockedReason(null);
      setPagesTruncated(0);
      setSkippedPageCount(payload.skippedPages ?? 0);
      const unitCount = payload.pages.length + payload.tables.length;
      setTableSourceCount(payload.tablePages ?? unitCount);
      setProgress({ phase: "parse", page: 0, totalPages: unitCount, message: "Detecting line items…" });

      const saved = loadSavedForceColumns(props.partnerId?.() ?? null);
      const initialForce = saved?.length ? saved : [];
      const count = await parsePayload(payload, initialForce);
      const skipNote = payload.skippedPages ? ` (${payload.skippedPages} non-table pages skipped)` : "";
      toast.success(`Found ${count} line item(s) from ${files.length} file(s)${skipNote}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "RFQ import failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
      setPendingFiles([]);
      if (fileInputRef) fileInputRef.value = "";
    }
  };

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || busy()) return;
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (!files.length) {
      setError("Selected file(s) are empty.");
      return;
    }

    setError(null);
    setLines([]);

    const {
      inspectWorkbookSheets,
      isMultiSheetWorkbook,
      needsSheetPicker,
      defaultSelectedSheets,
    } = await import("./rfqSpreadsheetImport");

    const pickerGroups: SheetPickerGroup[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isMultiSheetWorkbook(file)) continue;
      const sheets = await inspectWorkbookSheets(file);
      if (!needsSheetPicker(sheets)) continue;
      const selected = new Set(defaultSelectedSheets(sheets));
      pickerGroups.push({
        fileKey: fileImportKey(file, i),
        fileName: file.name,
        sheets: sheets.map((s) => ({ ...s, selected: selected.has(s.name) })),
      });
    }

    if (pickerGroups.length > 0) {
      setPendingFiles(files);
      setSheetPickerGroups(pickerGroups);
      setShowSheetPicker(true);
      if (fileInputRef) fileInputRef.value = "";
      return;
    }

    const sheetSelections: Record<string, string[]> = {};
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isMultiSheetWorkbook(file)) continue;
      const sheets = await inspectWorkbookSheets(file);
      const picked = defaultSelectedSheets(sheets);
      if (picked.length) sheetSelections[fileImportKey(file, i)] = picked;
    }
    await runImport(files, sheetSelections);
  };

  const confirmSheetPicker = async () => {
    const files = pendingFiles();
    if (!files.length || busy()) return;
    const sheetSelections: Record<string, string[]> = {};
    for (const group of sheetPickerGroups()) {
      const picked = group.sheets.filter((s) => s.selected && s.hasTable).map((s) => s.name);
      if (picked.length) sheetSelections[group.fileKey] = picked;
    }
    for (let i = 0; i < files.length; i++) {
      const key = fileImportKey(files[i], i);
      if (sheetSelections[key]) continue;
      const { inspectWorkbookSheets, isMultiSheetWorkbook, defaultSelectedSheets } = await import(
        "./rfqSpreadsheetImport"
      );
      if (!isMultiSheetWorkbook(files[i])) continue;
      const sheets = await inspectWorkbookSheets(files[i]);
      const picked = defaultSelectedSheets(sheets);
      if (picked.length) sheetSelections[key] = picked;
    }
    const anySheet = Object.values(sheetSelections).some((s) => s.length > 0);
    if (!anySheet && !files.some((f) => !f.name.match(/\.xlsx?$/i))) {
      toast.warning("Select at least one worksheet with line items.");
      return;
    }
    await runImport(files, sheetSelections);
  };

  const toggleSheet = (fileKey: string, sheetName: string, selected: boolean) => {
    setSheetPickerGroups((groups) =>
      groups.map((g) =>
        g.fileKey !== fileKey
          ? g
          : {
              ...g,
              sheets: g.sheets.map((s) => (s.name === sheetName ? { ...s, selected } : s)),
            },
      ),
    );
  };

  const needsAiEnhancement = () =>
    documentType() === "gov_section_spec" ||
    rfqParseNeedsAiEnhancement(
      lines().map((l) => ({ description: l.description, confidence: l.confidence })),
      tableDetected(),
    );

  const enhanceWithAI = async () => {
    const files = sourceFiles();
    const pages = sourcePages();
    const tables = sourceTables();
    if ((!pages.length && !tables.length) || busy()) return;
    if (!aiAvailable()) {
      toast.warning("AI enhancement is not configured on the server (DASHSCOPE_API_KEY).");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress({ phase: "parse", page: 0, totalPages: pages.length, message: "Preparing pages for AI…" });

    try {
      const { fetchRfqAiConfig, aiParsePayload } = await import("./rfqImportPipeline");
      const { renderRfqPageImagesForAI } = await import("./rfqDocumentOcr");
      const cfg = await fetchRfqAiConfig();
      if (!cfg?.enabled) {
        throw new Error("RFQ AI is not available on this server.");
      }

      const pageImages =
        files.length && pages.length
          ? await renderRfqPageImagesForAI(files, pages, cfg.max_pages || 10, (msg) =>
              setProgress({ phase: "parse", page: 0, totalPages: pages.length, message: msg }),
            )
          : [];

      const parsed = await aiParsePayload({ pages, tables }, pageImages, (p) =>
        setProgress({
          phase: "parse",
          page: p.batch,
          totalPages: p.totalBatches,
          message: p.message,
        }),
      );

      setTableDetected(parsed.table_detected);
      setDetectedColumns(parsed.detected_columns);
      setAiUsed(true);
      setAiModel(parsed.ai_model ?? cfg.vision_model ?? null);
      setDocumentType(parsed.document_type);
      setPagesTruncated(parsed.pages_truncated);

      const matched = await matchLines(parsed.lines);
      setLines(matched);
      toast.success(`AI extracted ${matched.length} line item(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI enhancement failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const reparseWithMapping = async () => {
    const pages = sourcePages();
    const tables = sourceTables();
    const force = forceColumns();
    if ((!pages.length && !tables.length) || busy()) return;
    if (force.filter(Boolean).length < 2) {
      toast.warning("Map at least two columns before re-parsing.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({ phase: "parse", page: pages.length + tables.length, totalPages: pages.length + tables.length, message: "Re-parsing with column map…" });
    try {
      saveForceColumns(props.partnerId?.() ?? null, force);
      const count = await parsePayload({ pages, tables }, force);
      toast.success(`Re-parsed ${count} line item(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Re-parse failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void onFiles(e.dataTransfer?.files ?? null);
  };

  const updateLine = (lineNo: number, patch: Partial<RfqParsedLine>) => {
    setLines((rows) => rows.map((r) => (r.line_no === lineNo ? { ...r, ...patch } : r)));
  };

  const pickAlternative = (lineNo: number, alt: RfqItemAlternative) => {
    updateLine(lineNo, {
      item_id: alt.item_id,
      item_code: alt.item_code,
      item_name: alt.item_name,
      sales_price: alt.sales_price,
      match_score: alt.match_score,
    });
  };

  const clearInventoryMatch = (lineNo: number) => {
    updateLine(lineNo, {
      item_id: null,
      sales_price: undefined,
      match_score: undefined,
    });
  };

  const onItemCreated = (item: CreatedItem) => {
    const lineNo = createLineNo();
    if (lineNo == null) return;
    pickAlternative(lineNo, {
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.item_name,
      sales_price: item.sales_price,
      match_score: 1,
    });
    setCreateLineNo(null);
    toast.success(`Bound ${item.item_code} to RFQ line.`);
  };

  const apply = () => {
    if (blockedReason() || documentType() === "invoice_like") {
      toast.warning(blockedReason() ?? "This document looks like an invoice, not an RFQ.");
      return;
    }
    const selected = lines().filter((l) => l.include);
    if (!selected.length) {
      toast.warning("Select at least one line to import.");
      return;
    }
    const out: QuotationLineRow[] = selected.map((ln, idx) => {
      const description = (ln.description || ln.item_name || ln.item_code || "").trim();
      const price = pickUnitPrice(ln);
      const base = emptyQuotationLine(idx + 1, price);
      const unitId = ln.unit_id ?? null;
      const unitCode = (ln.unit_code ?? "").trim();
      // Remark fallback only when the unit text could not be matched to a UoM.
      const unresolvedUnit = !unitId && !unitCode && ln.unit?.trim() ? `UOM: ${ln.unit.trim()}` : "";
      const remarkParts = [ln.remarks?.trim(), unresolvedUnit].filter(Boolean);
      return {
        ...base,
        line_no: idx + 1,
        item_id: ln.item_id ?? null,
        item_code: ln.item_code?.trim() ?? "",
        item_name: (ln.item_name || description).trim(),
        description,
        qty: ln.qty || "1",
        unit_id: unitId,
        unit_code: unitCode,
        remark: remarkParts.length ? remarkParts.join(" · ") : base.remark,
      };
    });
    props.onApply(out);
    props.onClose();
    reset();
    toast.success(`Imported ${out.length} line(s) into the quotation.`);
  };

  const showColumnMap = () => tableDetected() && detectedColumns().length > 0;

  const tableSourceLabel = () => {
    const sheets = sourceTables().map((t) => t.sheet).filter(Boolean) as string[];
    const parts: string[] = [];
    if (sheets.length) parts.push(`Excel: ${sheets.join(", ")}`);
    if (sourcePages().length) parts.push(`${sourcePages().length} PDF/image table page(s)`);
    return parts.join(" · ") || `${tableSourceCount()} table source(s)`;
  };

  const columnSummary = () =>
    detectedColumns()
      .map((c) => c.label || c.field)
      .filter(Boolean)
      .join(" · ");

  const documentTypeLabel = () => {
    switch (documentType()) {
      case "gov_section_spec":
        return "Government RFQ — section-based technical specifications";
      case "gov_annex_table":
        return "Government RFQ — Annex table";
      case "spreadsheet_boq":
        return "Spreadsheet BOQ / RFQ";
      case "spec_sheet":
        return "Technical specification sheet — no order quantities";
      case "invoice_like":
        return "Invoice-like document";
      case "rfq":
        return "RFQ document";
      default:
        return "";
    }
  };

  return (
    <Modal
      open={props.open}
      title="Smart RFQ import"
      stacked
      onClose={() => {
        if (!busy()) {
          props.onClose();
          reset();
        }
      }}
      wide
    >
      <p class="mb-4 text-sm text-text-secondary">
        Upload a customer RFQ — PDF, scanned images, Excel (.xlsx/.xls), CSV, or Word (.docx). We locate line-item tables,
        map common columns (item, qty, specs, unit price, etc.), and skip headers and totals. Adjust column mapping if
        needed, then pick inventory matches before applying. Legacy .doc files should be saved as .docx first.
      </p>

      <Show when={lines().length > 0}>
        <div class="mb-4 rounded-xl border-2 border-brand-200 bg-brand-50/60 px-4 py-4 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-brand-800">
                {aiUsed()
                  ? "AI-enhanced line items"
                  : tableDetected()
                    ? "Line-item table detected"
                    : "Extracted line items"}
              </p>
              <Show when={aiUsed() && aiModel()}>
                <p class="mt-1 text-xs text-brand-700/80">Model: {aiModel()}</p>
              </Show>
              <p class="mt-1 text-sm text-brand-900/90">{tableSourceLabel()}</p>
              <Show when={columnSummary()}>
                <p class="mt-1 text-xs text-brand-800/80">
                  Columns: {columnSummary()}
                </p>
              </Show>
              <Show when={skippedPageCount() > 0}>
                <p class="mt-1 text-xs text-brand-700/70">
                  {skippedPageCount()} non-table page(s) skipped to reduce noise.
                </p>
              </Show>
            </div>
            <div class="text-right">
              <p class="text-2xl font-bold text-brand-700">{lines().length}</p>
              <p class="text-xs text-brand-800/80">line items found</p>
              <Show when={aiAvailable() && needsAiEnhancement() && !aiUsed()}>
                <button
                  type="button"
                  class="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void enhanceWithAI()}
                >
                  Enhance with AI
                </button>
              </Show>
              <Show when={aiAvailable() && !needsAiEnhancement() && !aiUsed() && sourcePages().length > 0}>
                <button
                  type="button"
                  class="mt-2 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void enhanceWithAI()}
                >
                  Re-run with AI
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={lines().length === 0}>
      <div class="mb-4 grid gap-3 rounded-lg border border-stroke bg-slate-50 px-4 py-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-xs">
          <span class="font-medium text-text-primary">Page from (optional)</span>
          <input
            class={inputClass}
            type="number"
            min={1}
            placeholder="1"
            disabled={busy()}
            value={pageFrom()}
            onInput={(e) => setPageFrom(e.currentTarget.value)}
          />
        </label>
        <label class="flex flex-col gap-1 text-xs">
          <span class="font-medium text-text-primary">Page to (optional)</span>
          <input
            class={inputClass}
            type="number"
            min={1}
            placeholder="All pages"
            disabled={busy()}
            value={pageTo()}
            onInput={(e) => setPageTo(e.currentTarget.value)}
          />
        </label>
        <p class="text-xs text-text-secondary sm:col-span-2">
          For long PDFs, set a page range (e.g. 5–60) to import only the BOQ section. Cover and terms pages are skipped
          automatically when possible.
        </p>
      </div>

      <Show when={showSheetPicker()}>
        <div class="mb-4 rounded-lg border border-brand-200 bg-brand-50/50 px-4 py-3">
          <div class="mb-2 text-sm font-medium text-brand-800">Choose worksheets to import</div>
          <p class="mb-3 text-xs text-text-secondary">
            This workbook has multiple tabs with line-item tables. Select which sheets to include (e.g. Laptop vs
            Desktop).
          </p>
          <For each={sheetPickerGroups()}>
            {(group) => (
              <div class="mb-3 rounded-lg border border-stroke bg-white px-3 py-2">
                <div class="mb-2 text-xs font-medium text-text-primary">{group.fileName}</div>
                <div class="flex flex-col gap-2">
                  <For each={group.sheets}>
                    {(sheet) => (
                      <label
                        class={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                          sheet.hasTable ? "hover:bg-slate-50" : "opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          class="mt-0.5"
                          disabled={!sheet.hasTable || busy()}
                          checked={sheet.selected && sheet.hasTable}
                          onChange={(e) => toggleSheet(group.fileKey, sheet.name, e.currentTarget.checked)}
                        />
                        <span>
                          <span class="font-medium">{sheet.name}</span>
                          <Show
                            when={sheet.hasTable}
                            fallback={<span class="text-text-secondary"> — no line-item table detected</span>}
                          >
                            <span class="text-text-secondary">
                              {" "}
                              — {sheet.lineCount} line(s)
                              {sheet.headers.length ? ` · ${sheet.headers.slice(0, 4).join(", ")}` : ""}
                            </span>
                          </Show>
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
              disabled={busy()}
              onClick={() => {
                setShowSheetPicker(false);
                setPendingFiles([]);
                setSheetPickerGroups([]);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy()}
              onClick={() => void confirmSheetPicker()}
            >
              Import selected sheets
            </button>
          </div>
        </div>
      </Show>

      <Show when={largeDocHint()}>
        <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {largeDocHint()}
        </div>
      </Show>

      <Show when={documentTypeLabel()}>
        <div
          class={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            documentType() === "invoice_like"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-brand-200 bg-brand-50 text-brand-900"
          }`}
        >
          <p class="font-medium">{documentTypeLabel()}</p>
          <Show when={blockedReason()}>
            <p class="mt-1">{blockedReason()}</p>
          </Show>
          <Show when={documentType() === "gov_section_spec" && aiAvailable() && !aiUsed()}>
            <p class="mt-1 text-xs">AI enhancement can validate section headings and fold technical bullets into each item.</p>
          </Show>
          <Show when={pagesTruncated() > 0}>
            <p class="mt-1 text-xs">
              {pagesTruncated()} page(s) exceeded the AI page cap and were not sent to the model.
            </p>
          </Show>
        </div>
      </Show>

      <div
        role="button"
        tabindex={busy() ? -1 : 0}
        class={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          busy()
            ? "cursor-wait border-stroke bg-slate-50 opacity-70"
            : "border-brand-200 bg-brand-50/40 hover:bg-brand-50"
        }`}
        onClick={() => {
          if (!busy()) fileInputRef?.click();
        }}
        onKeyDown={(e) => {
          if (!busy() && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            fileInputRef?.click();
          }
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span class="text-sm font-medium text-brand-700">Drop RFQ files here or click to browse</span>
        <span class="mt-1 text-xs text-text-secondary">PDF, PNG, JPG, WEBP, XLSX, XLS, CSV, DOCX — multiple files OK</span>
        <input
          ref={fileInputRef}
          type="file"
          class="hidden"
          accept=".pdf,.docx,image/*,.xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          disabled={busy()}
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
      </div>
      </Show>

      <Show when={busy()}>
        <div class="mb-4 rounded-lg border border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
          <span>
            {progress()?.message ?? "Processing…"}
            <Show when={progress() && progress()!.totalPages > 0}>
              <span>
                {" "}
                ({progress()!.page}/{progress()!.totalPages})
              </span>
            </Show>
          </span>
        </div>
      </Show>

      <Show when={error()}>
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error()}
          <Show
            when={
              aiAvailable() &&
              !aiUsed() &&
              !blockedReason() &&
              lines().length === 0 &&
              sourcePages().length > 0
            }
          >
            <div class="mt-2">
              <button
                type="button"
                class="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                disabled={busy()}
                onClick={() => void enhanceWithAI()}
              >
                Try AI extraction
              </button>
              <span class="ml-2 text-xs text-red-700/80">
                Scanned or garbled documents often need the AI vision pass.
              </span>
            </div>
          </Show>
          <Show when={canExportPayload() && (sourcePages().length > 0 || sourceTables().length > 0)}>
            <button
              type="button"
              class="ml-2 text-xs font-medium text-red-700 underline"
              onClick={exportParsePayload}
            >
              Export parse payload
            </button>
          </Show>
        </div>
      </Show>

      <Show when={showColumnMap()}>
        <div class="mb-4 rounded-lg border border-stroke bg-slate-50 px-4 py-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium text-text-primary">Column mapping</span>
            <button
              type="button"
              class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              disabled={busy() || (!sourcePages().length && !sourceTables().length)}
              onClick={() => void reparseWithMapping()}
            >
              Re-parse with mapping
            </button>
          </div>
          <div class="flex flex-wrap gap-3">
            <For each={detectedColumns()}>
              {(col) => (
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-text-secondary">{col.label || `Col ${col.index + 1}`}</span>
                  <select
                    class={`${inputClass} min-w-[8rem]`}
                    value={forceColumns()[col.index] ?? col.field}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setForceColumns((prev) => {
                        const next = [...prev];
                        while (next.length <= col.index) next.push("");
                        next[col.index] = val;
                        return next;
                      });
                    }}
                  >
                    <For each={COLUMN_FIELDS}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>
                </label>
              )}
            </For>
          </div>
          <Show when={props.partnerId?.()}>
            <p class="mt-2 text-xs text-text-secondary">Column map is saved for this customer and reused on the next import.</p>
          </Show>
        </div>
      </Show>

      <Show when={lines().length > 0}>
        <Show when={unmatchedCount() > 0}>
          <AlertBanner kind="warning" title="Some lines are not in inventory" class="mb-3">
            <p>
              {unmatchedCount()} selected line(s) have no inventory item bound. Amber rows need a match, a weak-match
              pick, or a new item before you Apply — or leave them as free-text descriptions.
            </p>
          </AlertBanner>
        </Show>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-text-primary">Review line items</h3>
          <div class="flex items-center gap-3">
            <Show when={canExportPayload()}>
              <button
                type="button"
                class="text-xs font-medium text-text-secondary hover:underline disabled:opacity-50"
                title="Download the extracted pages/tables JSON for parser fixtures"
                disabled={busy() || (!sourcePages().length && !sourceTables().length)}
                onClick={exportParsePayload}
              >
                Export parse payload
              </button>
            </Show>
            <button
              type="button"
              class="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
              disabled={busy()}
              onClick={() => {
                reset();
                fileInputRef?.click();
              }}
            >
              Import another file
            </button>
          </div>
        </div>
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm text-text-secondary">
            {lines().filter((l) => l.include).length} of {lines().length} lines selected
            {skippedPageCount() > 0 ? ` · ${skippedPageCount()} pages skipped` : ""}
            {unmatchedCount() > 0 ? ` · ${unmatchedCount()} not in inventory` : ""}
          </span>
        </div>
        <div class="max-h-[55vh] overflow-auto rounded-lg border-2 border-brand-100 shadow-sm">
          <table class="erp-grid w-full text-left text-sm">
            <thead class="sticky top-0 bg-slate-50 text-xs uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2">Use</th>
                <th class="px-3 py-2">Pg</th>
                <th class="px-3 py-2">Conf.</th>
                <th class="px-3 py-2">Item code</th>
                <th class="px-3 py-2">Description</th>
                <th class="px-3 py-2">Qty</th>
                <th class="px-3 py-2">RFQ price</th>
                <th class="px-3 py-2">Our price</th>
                <th class="px-3 py-2">Remarks</th>
                <th class="px-3 py-2">Inventory match</th>
              </tr>
            </thead>
            <tbody>
              <For each={lines()}>
                {(row) => (
                  <tr classList={{ "bg-amber-50/60": !row.item_id }}>
                    <td class="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateLine(row.line_no, { include: e.currentTarget.checked })}
                      />
                    </td>
                    <td class="px-3 py-2 text-text-secondary">{row.page}</td>
                    <td class={`px-3 py-2 text-xs ${confidenceClass(row.confidence)}`}>
                      {Math.round(row.confidence * 100)}%
                      <Show when={row.match_score && row.match_score > 0}>
                        <span class="ml-1 text-text-secondary" title="Inventory match score">
                          · M{Math.round((row.match_score ?? 0) * 100)}%
                        </span>
                      </Show>
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class={inputClass}
                        value={row.item_code}
                        onInput={(e) => updateLine(row.line_no, { item_code: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class={inputClass}
                        value={row.description}
                        onInput={(e) => updateLine(row.line_no, { description: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class={`${inputClass} w-20`}
                        value={row.qty}
                        onInput={(e) => updateLine(row.line_no, { qty: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class={`${inputClass} w-24`}
                        value={row.unit_price ?? ""}
                        placeholder={row.rfq_unit_price ? String(row.rfq_unit_price) : ""}
                        onInput={(e) => updateLine(row.line_no, { unit_price: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2 text-xs text-text-secondary tabular-nums">
                      <Show when={row.sales_price && row.sales_price > 0} fallback="—">
                        {formatMoney(row.sales_price ?? 0)}
                      </Show>
                    </td>
                    <td class="px-3 py-2">
                      <input
                        class={inputClass}
                        value={row.remarks ?? ""}
                        onInput={(e) => updateLine(row.line_no, { remarks: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2 text-xs">
                      <div class="flex flex-col gap-1.5">
                        <Show when={!row.item_id && !(row.alternatives?.length)}>
                          <span class={unmatchedChipClass}>Not in inventory</span>
                        </Show>
                        <Show when={!row.item_id && (row.alternatives?.length ?? 0) > 0}>
                          <span class={unmatchedChipClass}>Weak match — review</span>
                        </Show>
                        <Show
                          when={row.alternatives?.length}
                          fallback={
                            row.item_id ? (
                              <span class="text-text-primary">
                                {row.item_code} — {row.item_name}
                              </span>
                            ) : (
                              <span class="text-text-secondary">Free text — editable in quotation</span>
                            )
                          }
                        >
                          <select
                            class={`${inputClass} max-w-[14rem]`}
                            value={String(row.item_id ?? "")}
                            onChange={(e) => {
                              const raw = e.currentTarget.value;
                              if (!raw) {
                                clearInventoryMatch(row.line_no);
                                return;
                              }
                              const id = Number(raw);
                              const alt = row.alternatives?.find((a) => a.item_id === id);
                              if (alt) pickAlternative(row.line_no, alt);
                            }}
                          >
                            <option value="">Free text</option>
                            <For each={row.alternatives}>
                              {(alt) => (
                                <option value={String(alt.item_id)}>
                                  {alt.item_code} — {alt.item_name} ({Math.round(alt.match_score * 100)}%)
                                </option>
                              )}
                            </For>
                          </select>
                        </Show>
                        <Show when={!row.item_id && canCreateItem()}>
                          <button
                            type="button"
                            class="self-start rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                            onClick={() => setCreateLineNo(row.line_no)}
                          >
                            Create item
                          </button>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <QuickItemModal
        open={createLineNo() != null}
        initialName={createLine()?.item_name || createLine()?.description || ""}
        onClose={() => setCreateLineNo(null)}
        onCreated={onItemCreated}
      />

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm"
          disabled={busy()}
          onClick={() => {
            props.onClose();
            reset();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy() || lines().length === 0 || !!blockedReason() || documentType() === "invoice_like"}
          onClick={apply}
        >
          Apply to quotation
        </button>
      </div>
    </Modal>
  );
}
