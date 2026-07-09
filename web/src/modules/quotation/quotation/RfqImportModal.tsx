import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import type { RfqOcrProgress } from "./rfqDocumentOcr";
import type { QuotationLineRow } from "./QuotationLineGrid";
import { emptyQuotationLine } from "./QuotationLineGrid";

export type RfqParsedLine = {
  page: number;
  line_no: number;
  item_code: string;
  description: string;
  qty: string;
  unit: string;
  confidence: number;
  item_id?: number | null;
  item_name?: string;
  sales_price?: number;
  match_score?: number;
  include: boolean;
};

type Props = {
  open: boolean;
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
  let fileInputRef: HTMLInputElement | undefined;

  const reset = () => {
    setLines([]);
    setPageCount(0);
    setProgress(null);
    setError(null);
    if (fileInputRef) fileInputRef.value = "";
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
      setPageCount(pages.length);
      setProgress({ phase: "parse", page: pages.length, totalPages: pages.length, message: "Parsing line items…" });

      const res = await apiFetch<{
        lines: Array<Omit<RfqParsedLine, "include">>;
        line_count: number;
      }>("/api/v1/quotation/rfq-import/parse", {
        method: "POST",
        body: JSON.stringify({ pages }),
      });
      if (!res.success || !res.data?.lines) {
        const msg = res.message ?? "Failed to parse RFQ.";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (!res.data.lines.length) {
        const msg = "No line items detected. Try a clearer scan or add lines manually.";
        setError(msg);
        toast.warning(msg);
        setLines([]);
        return;
      }

      const matchRes = await apiFetch<{ lines: RfqParsedLine[] }>("/api/v1/quotation/rfq-import/match-items", {
        method: "POST",
        body: JSON.stringify({ lines: res.data.lines }),
      });
      const matched = matchRes.data?.lines ?? res.data.lines;
      setLines(
        matched.map((ln) => ({
          ...ln,
          item_code: ln.item_code ?? "",
          description: ln.description ?? ln.item_name ?? "",
          qty: ln.qty || "1",
          unit: ln.unit ?? "",
          confidence: ln.confidence ?? 0.5,
          include: true,
        })),
      );
      toast.success(`Found ${matched.length} line item(s) across ${pages.length} page(s).`);
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

  const apply = () => {
    const selected = lines().filter((l) => l.include);
    if (!selected.length) {
      toast.warning("Select at least one line to import.");
      return;
    }
    const out: QuotationLineRow[] = selected.map((ln, idx) => {
      const description = (ln.description || ln.item_name || ln.item_code || "").trim();
      const base = emptyQuotationLine(idx + 1, ln.sales_price ? String(ln.sales_price) : "");
      return {
        ...base,
        line_no: idx + 1,
        item_id: ln.item_id ?? null,
        item_code: ln.item_code?.trim() ?? "",
        item_name: (ln.item_name || description).trim(),
        description,
        qty: ln.qty || "1",
      };
    });
    props.onApply(out);
    props.onClose();
    reset();
    toast.success(`Imported ${out.length} line(s) into the quotation.`);
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
        Upload a customer RFQ (PDF or images, multiple pages supported). We read each page and extract line items.
        Inventory matching is optional — unmatched lines import as free-text rows you can edit before saving the quotation.
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

      <Show when={lines().length > 0}>
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm text-text-secondary">
            {lines().filter((l) => l.include).length} of {lines().length} lines selected · {pageCount()} page(s)
          </span>
        </div>
        <div class="max-h-[50vh] overflow-auto rounded-lg border border-stroke">
          <table class="erp-grid w-full text-left text-sm">
            <thead class="sticky top-0 bg-slate-50 text-xs uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2">Use</th>
                <th class="px-3 py-2">Pg</th>
                <th class="px-3 py-2">Item code</th>
                <th class="px-3 py-2">Description</th>
                <th class="px-3 py-2">Qty</th>
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
                    <td class="px-3 py-2 text-xs">
                      <Show
                        when={row.item_id}
                        fallback={<span class="text-text-secondary">Free text — editable in quotation</span>}
                      >
                        <span class="text-text-primary">
                          {row.item_code} — {row.item_name}
                        </span>
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
