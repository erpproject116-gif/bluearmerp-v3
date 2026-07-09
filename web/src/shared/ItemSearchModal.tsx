import { For, Show, createSignal } from "solid-js";
import { DecimalInput } from "./DecimalInput";
import { inventoryItemSearchErrorMessage, postInventoryItemSearch } from "./inventoryItemSearch";
import { Field, inputClass } from "./SpreadsheetGrid";
import { modalDismissClass } from "./Modal";
import { useToast } from "./toast";
import { DataTableScroll, ResizableTd, ResizableTh } from "./ResizableTable";
import { useResizableColumns } from "./useResizableColumns";

export type ItemSearchRow = {
  id: number;
  item_code: string;
  item_name: string;
  spec_name?: string | null;
  sales_price: number;
  status: string;
  track_inventory_qty?: boolean;
  track_serial?: boolean;
  track_lot?: boolean;
  default_location_qty?: number | null;
  total_inv_qty?: number | null;
};

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
  onSelect: (row: ItemSearchRow) => void;
  contextLocationId?: number | null;
};

const ITEM_SEARCH_COLUMNS = [
  { key: "select", header: "Select", width: 88 },
  { key: "item_code", header: "Item Code", width: 120 },
  { key: "item_name", header: "Item Name [Spec]", width: 220 },
  { key: "sales_price", header: "Sale Price", width: 110 },
  { key: "default_loc", header: "Default Loc. Inv.", width: 130 },
  { key: "total_inv", header: "Total Inv.", width: 110 },
] as const;

export function ItemSearchModal(props: Props) {
  const toast = useToast();
  const [tab, setTab] = createSignal<"filters" | "results">("filters");
  const [filters, setFilters] = createSignal(defaultFilters());
  const [results, setResults] = createSignal<ItemSearchRow[]>([]);
  const [total, setTotal] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [searching, setSearching] = createSignal(false);
  const pageSize = 50;

  const runSearch = async (p = 1) => {
    setSearching(true);
    try {
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

      const res = await postInventoryItemSearch(body);
      if (!res.success) {
        toast.error(inventoryItemSearchErrorMessage(res));
        return;
      }
      setResults(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
      setPage(p);
      setTab("results");
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setFilters(defaultFilters());
    setResults([]);
    setTab("filters");
  };

  const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatQty = (n?: number | null) =>
    n == null ? "—" : n.toLocaleString("en-PH", { maximumFractionDigits: 4 });

  const toggleCategory = (value: string) => {
    setFilters((f) => {
      const set = new Set(f.item_categories);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, item_categories: [...set] };
    });
  };

  const toggleItemType = (value: string) => {
    setFilters((f) => {
      const set = new Set(f.item_types);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, item_types: [...set] };
    });
  };

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    ITEM_SEARCH_COLUMNS.map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-4xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Search Item</h2>
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
            <div class="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Item Code">
                <input class={inputClass} value={filters().item_code} onInput={(e) => setFilters((f) => ({ ...f, item_code: e.currentTarget.value }))} />
              </Field>
              <Field label="Item Name">
                <input class={inputClass} value={filters().item_name} onInput={(e) => setFilters((f) => ({ ...f, item_name: e.currentTarget.value }))} />
              </Field>
              <Field label="Spec. Name">
                <input class={inputClass} value={filters().spec_name} onInput={(e) => setFilters((f) => ({ ...f, spec_name: e.currentTarget.value }))} />
              </Field>
              <Field label="Unit">
                <input class={inputClass} value={filters().unit} onInput={(e) => setFilters((f) => ({ ...f, unit: e.currentTarget.value }))} />
              </Field>
              <Field label="Production process">
                <select class={inputClass} value={filters().production_process} onChange={(e) => setFilters((f) => ({ ...f, production_process: e.currentTarget.value }))}>
                  <option value="">All</option>
                  <option value="bundle">Bundle</option>
                  <option value="service">Service</option>
                </select>
              </Field>
              <Field label="Purchase price min">
                <DecimalInput class={inputClass} value={filters().purchase_price_min} onValue={(v) => setFilters((f) => ({ ...f, purchase_price_min: v }))} />
              </Field>
              <Field label="Purchase price max">
                <DecimalInput class={inputClass} value={filters().purchase_price_max} onValue={(v) => setFilters((f) => ({ ...f, purchase_price_max: v }))} />
              </Field>
              <Field label="Sale price min">
                <DecimalInput class={inputClass} value={filters().sales_price_min} onValue={(v) => setFilters((f) => ({ ...f, sales_price_min: v }))} />
              </Field>
              <Field label="Sale price max">
                <DecimalInput class={inputClass} value={filters().sales_price_max} onValue={(v) => setFilters((f) => ({ ...f, sales_price_max: v }))} />
              </Field>
              <Field label="Keyword" span="full">
                <input class={inputClass} value={filters().keyword} onInput={(e) => setFilters((f) => ({ ...f, keyword: e.currentTarget.value }))} />
              </Field>
              <div class="col-span-full">
                <span class="mb-1 block text-sm font-medium text-text-primary">Item category</span>
                <div class="flex flex-wrap gap-2">
                  <For each={ITEM_CATEGORIES}>
                    {(c) => (
                      <label class="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={filters().item_categories.includes(c.value)} onChange={() => toggleCategory(c.value)} />
                        {c.label}
                      </label>
                    )}
                  </For>
                </div>
              </div>
              <div class="col-span-full">
                <span class="mb-1 block text-sm font-medium text-text-primary">Item type</span>
                <div class="flex flex-wrap gap-2">
                  <For each={ITEM_TYPES}>
                    {(t) => (
                      <label class="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={filters().item_types.includes(t.value)} onChange={() => toggleItemType(t.value)} />
                        {t.label}
                      </label>
                    )}
                  </For>
                </div>
              </div>
              <Field label="Inv. quantity management">
                <select class={inputClass} value={filters().track_inventory_qty} onChange={(e) => setFilters((f) => ({ ...f, track_inventory_qty: e.currentTarget.value as typeof f.track_inventory_qty }))}>
                  <option value="all">All</option>
                  <option value="use">Use</option>
                  <option value="do_not_use">Do Not Use</option>
                </select>
              </Field>
              <Field label="Usage status">
                <select class={inputClass} value={filters().usage_status} onChange={(e) => setFilters((f) => ({ ...f, usage_status: e.currentTarget.value as typeof f.usage_status }))}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Deactivate</option>
                </select>
              </Field>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={filters().sort_by_modified} onChange={(e) => setFilters((f) => ({ ...f, sort_by_modified: e.currentTarget.checked }))} />
                Sort by modified date
              </label>
            </div>
            <div class="flex gap-2 border-t border-stroke px-5 py-3">
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={searching()} onClick={() => void runSearch(1)}>
                Search
              </button>
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={reset}>
                Reset
              </button>
            </div>
          </Show>

          <Show when={tab() === "results"}>
            <DataTableScroll class="max-h-[60vh] p-5">
              <Show when={searching()}>
                <p class="text-sm text-text-secondary">Searching…</p>
              </Show>
              <Show when={!searching() && results().length === 0}>
                <p class="text-sm text-text-secondary">No results. Set filters and click Search.</p>
              </Show>
              <table class="erp-grid text-sm" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
                <thead>
                  <tr class="text-left text-xs uppercase text-text-secondary">
                    {ITEM_SEARCH_COLUMNS.map((c) => (
                      <ResizableTh
                        columnKey={c.key}
                        width={widthFor(c.key)}
                        onResizeStart={onResizeStart}
                        class={`py-2 pr-4${c.key === "sales_price" || c.key === "default_loc" || c.key === "total_inv" ? " text-right" : ""}`}
                      >
                        {c.header}
                      </ResizableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <For each={results()}>
                    {(row) => (
                      <tr
                        class="cursor-pointer hover:bg-brand-50"
                        onDblClick={() => props.onSelect(row)}
                      >
                        <ResizableTd width={widthFor("select")} class="py-2 pr-4">
                          <button type="button" class="rounded border border-stroke px-2 py-0.5 text-xs hover:bg-brand-50" onClick={() => props.onSelect(row)}>
                            Select
                          </button>
                        </ResizableTd>
                        <ResizableTd width={widthFor("item_code")} class="py-2 pr-4 font-medium text-brand-600">
                          {row.item_code}
                        </ResizableTd>
                        <ResizableTd width={widthFor("item_name")} class="py-2 pr-4">
                          {row.item_name}
                          {row.spec_name ? ` [${row.spec_name}]` : ""}
                        </ResizableTd>
                        <ResizableTd width={widthFor("sales_price")} class="py-2 pr-4 text-right">
                          {money(row.sales_price)}
                        </ResizableTd>
                        <ResizableTd width={widthFor("default_loc")} class="py-2 pr-4 text-right">
                          {formatQty(row.default_location_qty)}
                        </ResizableTd>
                        <ResizableTd width={widthFor("total_inv")} class="py-2 text-right">
                          {formatQty(row.total_inv_qty)}
                        </ResizableTd>
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
            </DataTableScroll>
          </Show>
        </div>
      </div>
    </Show>
  );
}
