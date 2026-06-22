import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import type { ItemSearchRow } from "../../../shared/ItemSearchModal";

const ITEM_CATEGORIES = [
  { value: "raw_material", label: "Raw Material" },
  { value: "sub_material", label: "Sub Material" },
  { value: "finished_goods", label: "Finished Goods" },
  { value: "semi_finished_goods", label: "Semi-Finished Goods" },
  { value: "merchandise", label: "Merchandise" },
  { value: "intangible_merchandise", label: "Intangible Merchandise" },
];

const ITEM_TYPES = [
  { value: "item", label: "Item" },
  { value: "multiple_process_item", label: "Multiple Process Item" },
  { value: "multi_spec_item", label: "Multi Spec. Item" },
];

const defaultFilters = () => ({
  item_code: "",
  item_name: "",
  spec_name: "",
  unit: "",
  item_categories: ITEM_CATEGORIES.map((c) => c.value),
  production_process: "",
  purchase_price_min: "",
  purchase_price_max: "",
  sales_price_min: "",
  sales_price_max: "",
  track_inventory_qty: "all" as "all" | "use" | "do_not_use",
  keyword: "",
  item_types: ITEM_TYPES.map((t) => t.value),
  sort_by_modified: false,
  usage_status: "active" as "all" | "active" | "inactive",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: ItemSearchRow[]) => void;
  contextLocationId?: number | null;
};

export function SalesItemSearchModal(props: Props) {
  const [tab, setTab] = createSignal<"filters" | "results">("filters");
  const [filters, setFilters] = createSignal(defaultFilters());
  const [results, setResults] = createSignal<ItemSearchRow[]>([]);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [searching, setSearching] = createSignal(false);
  const pageSize = 50;

  const runSearch = async (p = 1) => {
    setSearching(true);
    const f = filters();
    const body: Record<string, unknown> = {
      item_code: f.item_code,
      item_name: f.item_name,
      spec_name: f.spec_name,
      unit: f.unit,
      item_categories: f.item_categories,
      production_process: f.production_process || undefined,
      track_inventory_qty: f.track_inventory_qty,
      keyword: f.keyword,
      item_types: f.item_types,
      sort_by_modified: f.sort_by_modified,
      usage_status: f.usage_status,
      page: p,
      page_size: pageSize,
    };
    if (props.contextLocationId) body.context_location_id = props.contextLocationId;
    if (f.purchase_price_min !== "") body.purchase_price_min = Number(f.purchase_price_min);
    if (f.purchase_price_max !== "") body.purchase_price_max = Number(f.purchase_price_max);
    if (f.sales_price_min !== "") body.sales_price_min = Number(f.sales_price_min);
    if (f.sales_price_max !== "") body.sales_price_max = Number(f.sales_price_max);

    const res = await apiFetch<ItemSearchRow[]>("/api/v1/inventory/items/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSearching(false);
    if (!res.success) return;
    setResults(res.data ?? []);
    setTotal(res.meta?.total ?? 0);
    setPage(p);
    setSelected(new Set<number>());
    setTab("results");
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const rows = results();
    if (selected().size === rows.length) setSelected(new Set<number>());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const confirm = () => {
    const picked = results().filter((r) => selected().has(r.id));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
  };

  const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-4xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Search Items (multi-select)</h2>
            <button type="button" class="text-text-secondary hover:text-text-primary" onClick={() => props.onClose()}>
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
            <div class="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              <Field label="Item Code">
                <input class={inputClass} value={filters().item_code} onInput={(e) => setFilters((f) => ({ ...f, item_code: e.currentTarget.value }))} />
              </Field>
              <Field label="Item Name">
                <input class={inputClass} value={filters().item_name} onInput={(e) => setFilters((f) => ({ ...f, item_name: e.currentTarget.value }))} />
              </Field>
              <Field label="Keyword" span="full">
                <input class={inputClass} value={filters().keyword} onInput={(e) => setFilters((f) => ({ ...f, keyword: e.currentTarget.value }))} />
              </Field>
            </div>
            <div class="flex gap-2 border-t border-stroke px-5 py-3">
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={searching()} onClick={() => void runSearch(1)}>
                Search
              </button>
            </div>
          </Show>

          <Show when={tab() === "results"}>
            <div class="max-h-[50vh] overflow-auto p-5">
              <table class="erp-grid min-w-full text-sm">
                <thead>
                  <tr class="border-b border-stroke text-left text-xs uppercase text-text-secondary">
                    <th class="w-10 py-2 pr-2">
                      <input type="checkbox" checked={results().length > 0 && selected().size === results().length} onChange={toggleAll} />
                    </th>
                    <th class="py-2 pr-4">Item Code</th>
                    <th class="py-2 pr-4">Item Name</th>
                    <th class="py-2 text-right">Sale Price</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={results()}>
                    {(row) => (
                      <tr class="cursor-pointer border-b border-stroke/60 hover:bg-brand-50" onDblClick={() => toggleRow(row.id)}>
                        <td class="py-2 pr-2">
                          <input type="checkbox" checked={selected().has(row.id)} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td class="py-2 pr-4 font-medium text-brand-600">{row.item_code}</td>
                        <td class="py-2 pr-4">{row.item_name}</td>
                        <td class="py-2 text-right">{money(row.sales_price)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={total() > pageSize}>
                <div class="mt-3 flex items-center gap-2">
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-sm disabled:opacity-40" disabled={page() <= 1} onClick={() => void runSearch(page() - 1)}>
                    Previous
                  </button>
                  <span class="text-sm text-text-secondary">
                    Page {page()} of {Math.max(1, Math.ceil(total() / pageSize))}
                  </span>
                  <button type="button" class="rounded border border-stroke px-2 py-1 text-sm disabled:opacity-40" disabled={page() >= Math.ceil(total() / pageSize)} onClick={() => void runSearch(page() + 1)}>
                    Next
                  </button>
                </div>
              </Show>
            </div>
            <div class="flex justify-end gap-2 border-t border-stroke px-5 py-3">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={selected().size === 0}
                onClick={confirm}
              >
                Add selected ({selected().size})
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
