import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import type { RfqOcrPage, RfqOcrProgress } from "./rfqDocumentOcr";
import type { QuotationLineRow } from "./QuotationLineGrid";
import { emptyQuotationLine } from "./QuotationLineGrid";

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

type Props = {
  open: boolean;
  partnerId?: () => number | null;
  onClose: () => void;
  onApply: (lines: QuotationLineRow[]) => void;
};

export function RfqImportModal(props: Props) {
  const toast = useToast();
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal<RfqOcrProgress | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [lines, setLines] = createSignal<RfqParsedLine[]>([]);
  const [pageCount, setPageCount] = createSignal(0);
  const [sourcePages, setSourcePages] = createSignal<RfqOcrPage[]>([]);
  const [tableDetected, setTableDetected] = createSignal(false);
  const [detectedColumns, setDetectedColumns] = createSignal<RfqDetectedColumn[]>([]);
  const [forceColumns, setForceColumns] = createSignal<string[]>([]);
  let fileInputRef: HTMLInputElement | undefined;

  const reset = () => {
    setLines([]);
    setPageCount(0);
    setSourcePages([]);
    setTableDetected(false);
    setDetectedColumns([]);
    setForceColumns([]);
    setProgress(null);
    setError(null);
    if (fileInputRef) fileInputRef.value = "";
  };

  const normalizeLines = (raw: Array<Omit<RfqParsedLine, "include">>): RfqParsedLine[] =>
    raw.map((ln) => ({
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

  const matchLines = async (parsed: Array<Omit<RfqParsedLine, "include">>) => {
    const partnerId = props.partnerId?.() ?? null;
    const matchRes = await apiFetch<{ lines: RfqParsedLine[] }>("/api/v1/quotation/rfq-import/match-items", {
      method: "POST",
      body: JSON.stringify({
        lines: parsed,
        partner_id: partnerId ?? undefined,
      }),
    });
    return normalizeLines(matchRes.data?.lines ?? parsed);
  };

  const parsePages = async (pages: RfqOcrPage[], force: string[]) => {
    const res = await apiFetch<{
      lines: Array<Omit<RfqParsedLine, "include">>;
      line_count: number;
      table_detected?: boolean;
      detected_columns?: RfqDetectedColumn[];
    }>("/api/v1/quotation/rfq-import/parse", {
      method: "POST",
      body: JSON.stringify({
        pages,
        force_columns: force.filter(Boolean).length >= 2 ? force : undefined,
      }),
    });
    if (!res.success || !res.data?.lines) {
      throw new Error(res.message ?? "Failed to parse RFQ.");
    }
    setTableDetected(!!res.data.table_detected);
    const cols = res.data.detected_columns ?? [];
    setDetectedColumns(cols);
    if (force.filter(Boolean).length >= 2) {
      setForceColumns(force);
    } else if (cols.length) {
      setForceColumns(cols.map((c) => c.field));
    }
    if (!res.data.lines.length) {
      setLines([]);
      throw new Error("No line items detected in the table area. Adjust column mapping or try a clearer scan.");
    }
    const matched = await matchLines(res.data.lines);
    setLines(matched);
    return matched.length;
  };

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || busy()) return;
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (!files.length) {
      setError("Selected file(s) are empty.");
      return;
    }

    setBusy(true);
    setError(null);
    setLines([]);
    setPageCount(0);
    setProgress({ phase: "ocr", page: 0, totalPages: 0, message: "Loading document tools…" });

    try {
      const { extractRfqDocumentPages } = await import("./rfqDocumentOcr");
      const pages = await extractRfqDocumentPages(files, setProgress);
      if (!pages.length) {
        setError("No pages could be read from the uploaded file(s).");
        return;
      }
      setSourcePages(pages);
      setPageCount(pages.length);
      setProgress({ phase: "parse", page: pages.length, totalPages: pages.length, message: "Detecting table rows…" });

      const saved = loadSavedForceColumns(props.partnerId?.() ?? null);
      const initialForce = saved?.length ? saved : [];
      const count = await parsePages(pages, initialForce);
      toast.success(`Found ${count} line item(s) across ${pages.length} page(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "RFQ import failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInputRef) fileInputRef.value = "";
    }
  };

  const reparseWithMapping = async () => {
    const pages = sourcePages();
    const force = forceColumns();
    if (!pages.length || busy()) return;
    if (force.filter(Boolean).length < 2) {
      toast.warning("Map at least two columns before re-parsing.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({ phase: "parse", page: pages.length, totalPages: pages.length, message: "Re-parsing with column map…" });
    try {
      saveForceColumns(props.partnerId?.() ?? null, force);
      const count = await parsePages(pages, force);
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

  const apply = () => {
    const selected = lines().filter((l) => l.include);
    if (!selected.length) {
      toast.warning("Select at least one line to import.");
      return;
    }
    const out: QuotationLineRow[] = selected.map((ln, idx) => {
      const description = (ln.description || ln.item_name || ln.item_code || "").trim();
      const price = pickUnitPrice(ln);
      const base = emptyQuotationLine(idx + 1, price);
      const remarkParts = [ln.remarks?.trim(), ln.unit?.trim() ? `UOM: ${ln.unit.trim()}` : ""].filter(Boolean);
      return {
        ...base,
        line_no: idx + 1,
        item_id: ln.item_id ?? null,
        item_code: ln.item_code?.trim() ?? "",
        item_name: (ln.item_name || description).trim(),
        description,
        qty: ln.qty || "1",
        remark: remarkParts.length ? remarkParts.join(" · ") : base.remark,
      };
    });
    props.onApply(out);
    props.onClose();
    reset();
    toast.success(`Imported ${out.length} line(s) into the quotation.`);
  };

  const showColumnMap = () => tableDetected() && detectedColumns().length > 0;

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
        Upload a customer RFQ (PDF or images, multiple pages supported). We locate the line-item table on each page,
        map common columns (item, qty, description, unit price, etc.), and skip headers and totals. Adjust column mapping
        if needed, then pick inventory matches before applying.
      </p>

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
        <span class="mt-1 text-xs text-text-secondary">PDF, PNG, JPG, WEBP — multiple files OK</span>
        <input
          ref={fileInputRef}
          type="file"
          class="hidden"
          accept=".pdf,image/*"
          multiple
          disabled={busy()}
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
      </div>

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
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error()}</div>
      </Show>

      <Show when={showColumnMap()}>
        <div class="mb-4 rounded-lg border border-stroke bg-slate-50 px-4 py-3">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium text-text-primary">Column mapping</span>
            <button
              type="button"
              class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              disabled={busy() || !sourcePages().length}
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
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm text-text-secondary">
            {lines().filter((l) => l.include).length} of {lines().length} lines selected · {pageCount()} page(s)
            {tableDetected() ? " · table detected" : " · text fallback"}
          </span>
        </div>
        <div class="max-h-[50vh] overflow-auto rounded-lg border border-stroke">
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
                  <tr>
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
                    <td class="px-3 py-2 text-xs text-text-secondary">
                      <Show when={row.sales_price && row.sales_price > 0} fallback="—">
                        {row.sales_price}
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
                            const id = Number(e.currentTarget.value);
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
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

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
          disabled={busy() || lines().length === 0}
          onClick={apply}
        >
          Apply to quotation
        </button>
      </div>
    </Modal>
  );
}
