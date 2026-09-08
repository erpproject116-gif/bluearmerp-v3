import { createMemo, createSignal, For, onMount, onCleanup, Show, createResource } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  inventoryStatusExportUrl,
  useInventoryStatusReport,
  type InventoryStatusFilters,
  type InventoryStatusRow,
} from "../../../shared/reports/useModuleReports";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { ReportEmptyMessage } from "../../../shared/reports/ReportTableStates";
import { apiFetch } from "../../../shared/api";
import { formatMoney } from "../../../shared/money";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns, type ColumnWidthDef } from "../../../shared/useResizableColumns";
import { StocksHowItFits } from "../StocksHowItFits";
import { FindStockUnitsModal, type FindStockUnitsTarget } from "./FindStockUnitsModal";
import { InvBookLedgerModal, type InvBookLedgerTarget } from "./InvBookLedgerModal";

type CategoryOpt = { id: number; name: string };
type LocationOpt = { id: number; location_name: string; is_rma?: boolean; status?: string };

const STOCK_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "in_stock", label: "In stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "below_safety", label: "Below safety" },
  { value: "has_reserved", label: "Has reserved qty" },
  { value: "inactive_item", label: "Inactive item" },
];

/** One matrix column; may merge multiple location ids that share the same display name. */
type BranchCol = { key: string; id: number; name: string; locationIds: number[] };

type MatrixCell = {
  location_id: number;
  qty_on_hand: number;
  available_qty: number;
  serial_unit_count: number;
  track_serial: boolean;
};

type MatrixItem = {
  item_id: number;
  item_code: string;
  item_name: string;
  spec_name: string;
  category_name: string;
  unit_code: string;
  purchase_price: number;
  vip_price: number;
  sales_price: number;
  track_serial: boolean;
  total_on_hand: number;
  byLocation: Map<number, MatrixCell>;
};

function defaultFilters(): InventoryStatusFilters {
  return { view: "matrix" };
}

function ledgerHref(itemId: number, locationId: number) {
  const qs = new URLSearchParams({
    item_id: String(itemId),
    location_id: String(locationId),
  });
  return `/app/inventory/reports/stock-ledger?${qs}`;
}

function normalizeFilters(raw: InventoryStatusFilters): InventoryStatusFilters {
  const next: InventoryStatusFilters = { ...raw, view: "matrix" };
  if (!next.q) delete next.q;
  if (!next.status) delete next.status;
  if (!next.category_id) delete next.category_id;
  if (!next.location_id) delete next.location_id;
  if (!next.in_stock_only) delete next.in_stock_only;
  return next;
}

function filtersFromSearchParams(params: Record<string, string | string[] | undefined>): InventoryStatusFilters {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const out: InventoryStatusFilters = { view: "matrix" };
  const q = one("q");
  if (q) out.q = q;
  const status = one("status");
  if (status) out.status = status;
  const categoryId = Number(one("category_id"));
  if (Number.isFinite(categoryId) && categoryId > 0) out.category_id = categoryId;
  const locationId = Number(one("location_id") || one("branch_id"));
  if (Number.isFinite(locationId) && locationId > 0) out.location_id = locationId;
  const inStock = one("in_stock_only").toLowerCase();
  if (inStock === "1" || inStock === "true" || inStock === "yes") out.in_stock_only = 1;
  return out;
}

function fmtQty(n: number) {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "";
}

/** One column per tenant branch (non-RMA). Prefer active locations; still merge duplicate names. */
function buildBranchCols(locs: LocationOpt[], rows: InventoryStatusRow[]): BranchCol[] {
  const source = locs.filter((l) => !l.is_rma);

  const byName = new Map<string, BranchCol>();
  const push = (id: number, name: string) => {
    const label = (name || `Location ${id}`).trim() || `Location ${id}`;
    const key = label.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (!existing.locationIds.includes(id)) existing.locationIds.push(id);
      return;
    }
    byName.set(key, { key, id, name: label, locationIds: [id] });
  };

  if (source.length > 0) {
    for (const l of source) push(l.id, l.location_name);
  }
  // Ensure any location present in stock rows still gets a column (e.g. locations API truncated).
  for (const r of rows) push(r.location_id, r.branch_name || r.location_name);

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function cellForBranch(item: MatrixItem, b: BranchCol): MatrixCell | null {
  let qty = 0;
  let available = 0;
  let serial = 0;
  let track = false;
  let linkId = b.id;
  let bestQty = -Infinity;
  let found = false;
  for (const id of b.locationIds) {
    const c = item.byLocation.get(id);
    if (!c) continue;
    found = true;
    qty += c.qty_on_hand;
    available += c.available_qty;
    serial += c.serial_unit_count;
    track = track || c.track_serial;
    if (c.qty_on_hand > bestQty) {
      bestQty = c.qty_on_hand;
      linkId = id;
    }
  }
  if (!found) return null;
  return {
    location_id: linkId,
    qty_on_hand: qty,
    available_qty: available,
    serial_unit_count: serial,
    track_serial: track,
  };
}

function pivotRows(rows: InventoryStatusRow[]): MatrixItem[] {
  const order: number[] = [];
  const map = new Map<number, MatrixItem>();
  for (const r of rows) {
    let item = map.get(r.item_id);
    if (!item) {
      item = {
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        spec_name: r.spec_name ?? "",
        category_name: r.category_name ?? "",
        unit_code: r.unit_code ?? "",
        purchase_price: r.purchase_price ?? 0,
        vip_price: r.vip_price ?? 0,
        sales_price: r.sales_price ?? 0,
        track_serial: Boolean(r.track_serial),
        total_on_hand: 0,
        byLocation: new Map(),
      };
      map.set(r.item_id, item);
      order.push(r.item_id);
    }
    item.total_on_hand += r.qty_on_hand;
    item.byLocation.set(r.location_id, {
      location_id: r.location_id,
      qty_on_hand: r.qty_on_hand,
      available_qty: r.available_qty,
      serial_unit_count: r.serial_unit_count ?? 0,
      track_serial: Boolean(r.track_serial),
    });
  }
  return order.map((id) => map.get(id)!);
}

export default function InventoryStatusReportPage() {
  const [searchParams] = useSearchParams();
  const [draft, setDraft] = createSignal<InventoryStatusFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<InventoryStatusFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [unitsTargetRow, setUnitsTargetRow] = createSignal<FindStockUnitsTarget | null>(null);
  const [ledgerRow, setLedgerRow] = createSignal<InvBookLedgerTarget | null>(null);
  const pageSize = 50;
  let qDebounce: ReturnType<typeof setTimeout> | undefined;

  const [categories] = createResource(async () => {
    const res = await apiFetch<CategoryOpt[]>("/api/v1/inventory/item-categories");
    return res.success ? (res.data ?? []) : [];
  });
  const [locations] = createResource(async () => {
    const res = await apiFetch<LocationOpt[]>(
      "/api/v1/inventory/locations?page=1&pageSize=500&sort=location_name&order=asc",
    );
    return res.success ? (res.data ?? []) : [];
  });

  const report = useInventoryStatusReport(() => ({
    filters: submitted(),
    page: page(),
    pageSize,
    sort: "item_code",
    order: "asc",
    enabled: true,
  }));

  const applySubmitted = (next: InventoryStatusFilters, resetPage = true) => {
    setSubmitted(normalizeFilters(next));
    if (resetPage) setPage(1);
    setGeneratedAt(new Date());
  };

  const search = () => applySubmitted(draft());

  const patchLive = (p: Partial<InventoryStatusFilters>) => {
    setDraft((prev) => {
      const next = { ...prev, ...p };
      applySubmitted(next);
      return next;
    });
  };

  const patchQ = (q: string) => {
    setDraft((prev) => ({ ...prev, q }));
    if (qDebounce) clearTimeout(qDebounce);
    qDebounce = setTimeout(() => {
      applySubmitted({ ...draft(), q });
    }, 300);
  };

  onMount(() => {
    const fromUrl = filtersFromSearchParams(searchParams);
    if (Object.keys(fromUrl).some((k) => k !== "view")) {
      setDraft(fromUrl);
      applySubmitted(fromUrl, false);
    } else {
      search();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        if (qDebounce) clearTimeout(qDebounce);
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey);
      if (qDebounce) clearTimeout(qDebounce);
    });
  });

  const matrixItems = createMemo(() => pivotRows(report.data?.rows ?? []));

  /** One column per branch name; duplicate HQ (etc.) location rows are merged. */
  const branchCols = createMemo((): BranchCol[] =>
    buildBranchCols(locations() ?? [], report.data?.rows ?? []),
  );

  const colDefs = createMemo((): ColumnWidthDef[] => {
    const fixed: ColumnWidthDef[] = [
      { key: "item_code", width: 120, minWidth: 88 },
      { key: "item_name", width: 220, minWidth: 140 },
      { key: "spec", width: 160, minWidth: 100 },
      { key: "purchase", width: 120, minWidth: 88 },
      { key: "vip", width: 110, minWidth: 80 },
      { key: "sales", width: 110, minWidth: 80 },
      { key: "total", width: 88, minWidth: 64 },
    ];
    return [
      ...fixed,
      ...branchCols().map((b) => ({ key: `loc-${b.key}`, width: 96, minWidth: 72 })),
    ];
  });
  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(colDefs);

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));
  const filters = () => submitted();

  const openSerials = (item: MatrixItem, locId: number, locName: string) => {
    setUnitsTargetRow({
      kind: "serials",
      item_id: item.item_id,
      item_code: item.item_code,
      item_name: item.item_name,
      location_id: locId,
      branch_name: locName,
    });
  };

  const openInvBook = (item: MatrixItem) => {
    setLedgerRow({
      item_id: item.item_id,
      item_code: item.item_code,
      item_name: item.item_name,
    });
  };

  return (
    <ReportPageLayout
      title="Inv. Balance by Location"
      description="Item Code, Item Name, Item Specs, prices, Total on-hand, and qty for every branch — click item code or name for Inv. Book. Print / CSV / PDF from the report toolbar. F8 refreshes."
      showDateFilters={false}
      submitted={true}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      onSearch={search}
      exportFilename="inv-balance-by-location"
      onReset={() => {
        if (qDebounce) clearTimeout(qDebounce);
        setDraft(defaultFilters());
        setPage(1);
        setSubmitted(defaultFilters());
        setGeneratedAt(new Date());
      }}
      onExportCsv={() => void downloadReportCsv(inventoryStatusExportUrl(filters()), "inv-balance-by-location.csv")}
      filterExtra={
        <div class="mt-4 space-y-3">
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <input
                class={inputClass}
                placeholder="Item code or name…"
                value={draft().q ?? ""}
                onInput={(e) => patchQ(e.currentTarget.value)}
              />
            </Field>
            <Field label="Branch (item filter)">
              <select
                class={inputClass}
                value={draft().location_id ?? ""}
                onChange={(e) =>
                  patchLive({ location_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
                }
              >
                <option value="">All branches</option>
                <For each={(locations() ?? []).filter((l) => !l.is_rma && (l.status == null || l.status === "active"))}>
                  {(l) => <option value={l.id}>{l.location_name}</option>}
                </For>
              </select>
            </Field>
            <Field label="Category">
              <select
                class={inputClass}
                value={draft().category_id ?? ""}
                onChange={(e) =>
                  patchLive({ category_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
                }
              >
                <option value="">All categories</option>
                <For each={categories() ?? []}>{(c) => <option value={c.id}>{c.name}</option>}</For>
              </select>
            </Field>
            <Field label="Stock status">
              <select
                class={inputClass}
                value={draft().status ?? ""}
                onChange={(e) => patchLive({ status: e.currentTarget.value || undefined })}
              >
                <For each={STOCK_STATUS_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </Field>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={Boolean(draft().in_stock_only)}
              onChange={(e) => patchLive({ in_stock_only: e.currentTarget.checked ? 1 : undefined })}
            />
            In stock only (available &gt; 0 at filtered / any branch)
          </label>
        </div>
      }
    >
      <StocksHowItFits class="mb-4" />
      <FindStockUnitsModal target={unitsTargetRow()} onClose={() => setUnitsTargetRow(null)} />
      <InvBookLedgerModal
        open={ledgerRow() != null}
        row={ledgerRow()}
        onClose={() => setLedgerRow(null)}
      />
      <Show when={matrixItems().length === 0 && !report.isFetching}>
        <ReportEmptyMessage
          message={
            Object.keys(normalizeFilters(filters())).filter((k) => k !== "view").length === 0
              ? "No active items yet. Create items under Inventory → Items, then receive stock to fill branch quantities."
              : "No items match these filters — try All branches, clear Stock status, or turn off In stock only."
          }
        />
        <p class="mt-3 text-center text-sm">
          <A href="/app/inventory/items" class="text-brand-600 hover:underline">
            Items
          </A>
          {" · "}
          <A href="/app/purchases/purchase-receive" class="text-brand-600 hover:underline">
            Purchase Receive
          </A>
          {" · "}
          <A href="/app/inventory/stock-movements" class="text-brand-600 hover:underline">
            Stock Movements
          </A>
        </p>
      </Show>
      <Show when={matrixItems().length > 0}>
        <DataTableScroll class="overflow-x-auto">
          <table
            class="erp-grid text-left text-sm"
            style={{ width: `${tableWidth()}px`, "min-width": "100%" }}
          >
            <thead class="sticky top-0 z-10 bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <ResizableTh
                  columnKey="item_code"
                  width={widthFor("item_code")}
                  onResizeStart={onResizeStart}
                  class="sticky left-0 z-20 bg-brand-50 px-3 py-2"
                >
                  Item Code
                </ResizableTh>
                <ResizableTh
                  columnKey="item_name"
                  width={widthFor("item_name")}
                  onResizeStart={onResizeStart}
                  class="sticky left-[7.5rem] z-20 bg-brand-50 px-3 py-2"
                >
                  Item Name
                </ResizableTh>
                <ResizableTh columnKey="spec" width={widthFor("spec")} onResizeStart={onResizeStart} class="px-3 py-2">
                  Item Specs
                </ResizableTh>
                <ResizableTh
                  columnKey="purchase"
                  width={widthFor("purchase")}
                  onResizeStart={onResizeStart}
                  class="px-3 py-2 text-right"
                >
                  Purchase Price
                </ResizableTh>
                <ResizableTh
                  columnKey="vip"
                  width={widthFor("vip")}
                  onResizeStart={onResizeStart}
                  class="px-3 py-2 text-right"
                >
                  VIP Price
                </ResizableTh>
                <ResizableTh
                  columnKey="sales"
                  width={widthFor("sales")}
                  onResizeStart={onResizeStart}
                  class="px-3 py-2 text-right"
                >
                  Sales Price
                </ResizableTh>
                <ResizableTh
                  columnKey="total"
                  width={widthFor("total")}
                  onResizeStart={onResizeStart}
                  class="px-3 py-2 text-right"
                >
                  Total
                </ResizableTh>
                <For each={branchCols()}>
                  {(b) => (
                    <ResizableTh
                      columnKey={`loc-${b.key}`}
                      width={widthFor(`loc-${b.key}`)}
                      onResizeStart={onResizeStart}
                      class="px-3 py-2 text-right whitespace-nowrap"
                    >
                      {b.name}
                    </ResizableTh>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={matrixItems()}>
                {(item) => {
                  const negTotal = item.total_on_hand < -0.0001;
                  return (
                    <tr class={`border-t border-stroke/60 ${negTotal ? "bg-red-50" : ""}`}>
                      <ResizableTd
                        width={widthFor("item_code")}
                        class="sticky left-0 z-[1] bg-inherit px-3 py-2 font-medium tabular-nums"
                      >
                        <button
                          type="button"
                          class="text-brand-700 hover:underline"
                          aria-label={`Open inv. book for ${item.item_code}`}
                          onClick={() => openInvBook(item)}
                        >
                          {item.item_code}
                        </button>
                      </ResizableTd>
                      <ResizableTd
                        width={widthFor("item_name")}
                        class="sticky left-[7.5rem] z-[1] bg-inherit px-3 py-2"
                      >
                        <button
                          type="button"
                          class="text-left text-brand-700 hover:underline"
                          aria-label={`Open inv. book for ${item.item_name}`}
                          onClick={() => openInvBook(item)}
                        >
                          {item.item_name}
                        </button>
                        <Show when={item.unit_code}>
                          <div class="text-[11px] text-text-secondary">{item.unit_code}</div>
                        </Show>
                      </ResizableTd>
                      <ResizableTd width={widthFor("spec")} class="px-3 py-2 text-text-secondary">
                        {item.spec_name || "—"}
                      </ResizableTd>
                      <ResizableTd width={widthFor("purchase")} class="px-3 py-2 text-right tabular-nums">
                        {formatMoney(item.purchase_price)}
                      </ResizableTd>
                      <ResizableTd width={widthFor("vip")} class="px-3 py-2 text-right tabular-nums">
                        {formatMoney(item.vip_price)}
                      </ResizableTd>
                      <ResizableTd width={widthFor("sales")} class="px-3 py-2 text-right tabular-nums">
                        {formatMoney(item.sales_price)}
                      </ResizableTd>
                      <ResizableTd
                        width={widthFor("total")}
                        class={`px-3 py-2 text-right tabular-nums font-medium ${negTotal ? "text-red-700" : ""}`}
                      >
                        {fmtQty(item.total_on_hand)}
                      </ResizableTd>
                      <For each={branchCols()}>
                        {(b) => {
                          const cell = cellForBranch(item, b);
                          const qty = cell?.qty_on_hand ?? 0;
                          const empty = cell == null || Math.abs(qty) < 0.0000001;
                          const neg = qty < -0.0001;
                          const linkId = cell?.location_id ?? b.id;
                          return (
                            <ResizableTd
                              width={widthFor(`loc-${b.key}`)}
                              class={`px-3 py-2 text-right tabular-nums ${neg ? "bg-red-50 text-red-700" : ""}`}
                            >
                              <Show
                                when={!empty}
                                fallback={<span class="text-text-secondary">0</span>}
                              >
                                <div class="inline-flex items-center justify-end gap-1">
                                  <A
                                    href={ledgerHref(item.item_id, linkId)}
                                    class="hover:underline"
                                    title={`Movements — ${b.name}`}
                                  >
                                    {fmtQty(qty)}
                                  </A>
                                  <Show when={cell?.track_serial && (cell?.serial_unit_count ?? 0) > 0}>
                                    <button
                                      type="button"
                                      class="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700"
                                      onClick={() => openSerials(item, linkId, b.name)}
                                    >
                                      {cell!.serial_unit_count} sn
                                    </button>
                                  </Show>
                                </div>
                              </Show>
                            </ResizableTd>
                          );
                        }}
                      </For>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </DataTableScroll>
      </Show>
    </ReportPageLayout>
  );
}
