import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../../shared/Modal";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";

export type PartnerSearchRow = {
  id: number;
  partner_code: string;
  company_name: string;
  partner_kind: string;
  status: string;
};

const PARTNER_KINDS = [
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
  { value: "both", label: "Both" },
] as const;

const defaultFilters = () => ({
  partner_code: "",
  company_name: "",
  keyword: "",
  partner_kinds: PARTNER_KINDS.map((k) => k.value),
  usage_status: "active" as "all" | "active" | "inactive",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: PartnerSearchRow) => void;
};

const PARTNER_SEARCH_COLUMNS = [
  { key: "select", header: "Select", width: 88 },
  { key: "partner_code", header: "Code", width: 120 },
  { key: "partner_name", header: "Name", width: 220 },
  { key: "partner_kind", header: "Kind", width: 100 },
] as const;

export function PartnerSearchModal(props: Props) {
  const [tab, setTab] = createSignal<"filters" | "results">("filters");
  const [filters, setFilters] = createSignal(defaultFilters());
  const [results, setResults] = createSignal<PartnerSearchRow[]>([]);
  const [total, setTotal] = createSignal(0);
  const [searching, setSearching] = createSignal(false);
  const [pageSize] = createSignal(50);

  const runSearch = async (p = 1) => {
    setSearching(true);
    const f = filters();
    const qs = new URLSearchParams({
      page: String(p),
      pageSize: String(pageSize()),
      sort: "partner_code",
      order: "asc",
    });
    const q = [f.partner_code, f.company_name, f.keyword].filter((s) => s.trim()).join(" ");
    if (q) qs.set("q", q);
    if (f.usage_status !== "all") qs.set("status", f.usage_status);

    const res = await apiFetch<PartnerSearchRow[]>(`/api/v1/inventory/partners?${qs}`);
    setSearching(false);
    if (!res.success) return;
    const kinds = new Set<string>(f.partner_kinds);
    const rows = (res.data ?? []).filter((row) => kinds.has(row.partner_kind));
    setResults(rows);
    setTotal(res.meta?.total ?? rows.length);
    setTab("results");
  };

  const reset = () => {
    setFilters(defaultFilters());
    setResults([]);
    setTab("filters");
  };

  const toggleKind = (value: (typeof PARTNER_KINDS)[number]["value"]) => {
    setFilters((f) => {
      const set = new Set<string>(f.partner_kinds);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, partner_kinds: [...set] as Array<(typeof PARTNER_KINDS)[number]["value"]> };
    });
  };

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    PARTNER_SEARCH_COLUMNS.map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-3xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Search Partner</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <div class="border-b border-stroke px-5 py-2">
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-sm font-medium"
                classList={{ "bg-brand-50 text-brand-600": tab() === "filters", "text-text-secondary": tab() !== "filters" }}
                onClick={() => setTab("filters")}
              >
                Filters
              </button>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-sm font-medium"
                classList={{ "bg-brand-50 text-brand-600": tab() === "results", "text-text-secondary": tab() !== "results" }}
                onClick={() => setTab("results")}
              >
                Results {total() > 0 ? `(${total()})` : ""}
              </button>
            </div>
          </div>

          <Show when={tab() === "filters"}>
            <div class="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              <Field label="Code">
                <input class={inputClass} value={filters().partner_code} onInput={(e) => setFilters((f) => ({ ...f, partner_code: e.currentTarget.value }))} />
              </Field>
              <Field label="Name">
                <input class={inputClass} value={filters().company_name} onInput={(e) => setFilters((f) => ({ ...f, company_name: e.currentTarget.value }))} />
              </Field>
              <Field label="Keyword" span="full">
                <input class={inputClass} value={filters().keyword} onInput={(e) => setFilters((f) => ({ ...f, keyword: e.currentTarget.value }))} />
              </Field>
              <Field label="Partner kind" span="full">
                <div class="flex flex-wrap gap-3">
                  <For each={PARTNER_KINDS}>
                    {(k) => (
                      <label class="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={filters().partner_kinds.includes(k.value)} onChange={() => toggleKind(k.value)} />
                        {k.label}
                      </label>
                    )}
                  </For>
                </div>
              </Field>
              <Field label="Usage status">
                <select class={inputClass} value={filters().usage_status} onChange={(e) => setFilters((f) => ({ ...f, usage_status: e.currentTarget.value as typeof f.usage_status }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </Field>
            </div>
            <div class="flex gap-2 border-t border-stroke px-5 py-3">
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => void runSearch(1)}>
                Search (F8)
              </button>
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={reset}>
                Reset
              </button>
            </div>
          </Show>

          <Show when={tab() === "results"}>
            <Show when={searching()}>
              <p class="p-5 text-sm text-text-secondary">Searching…</p>
            </Show>
            <DataTableScroll class="max-h-[60vh]">
              <table class="erp-grid text-sm" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
                <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                  <tr>
                    <For each={PARTNER_SEARCH_COLUMNS}>
                      {(c) => (
                        <ResizableTh columnKey={c.key} width={widthFor(c.key)} onResizeStart={onResizeStart} resizable={c.key !== "select"} class="px-3 py-2">
                          {c.header}
                        </ResizableTh>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={results()}>
                    {(row) => (
                      <tr class="border-t border-stroke/60 hover:bg-slate-50">
                        <ResizableTd width={widthFor("select")} class="px-3 py-2">
                          <button
                            type="button"
                            class="text-brand-600 hover:underline"
                            onClick={() => {
                              props.onSelect(row);
                              props.onClose();
                            }}
                          >
                            Select
                          </button>
                        </ResizableTd>
                        <ResizableTd width={widthFor("partner_code")} class="px-3 py-2">{row.partner_code}</ResizableTd>
                        <ResizableTd width={widthFor("partner_name")} class="px-3 py-2">{row.company_name}</ResizableTd>
                        <ResizableTd width={widthFor("partner_kind")} class="px-3 py-2 capitalize">{row.partner_kind}</ResizableTd>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </DataTableScroll>
          </Show>
        </div>
      </div>
    </Show>
  );
}
