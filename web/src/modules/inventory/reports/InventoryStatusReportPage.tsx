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
import { StocksHowItFits } from "../StocksHowItFits";
import { FindStockUnitsModal, type FindStockUnitsTarget } from "./FindStockUnitsModal";

type CategoryOpt = { id: number; name: string };
type LocationOpt = { id: number; location_name: string; is_rma?: boolean };

const STOCK_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "in_stock", label: "In stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "below_safety", label: "Below safety" },
  { value: "has_reserved", label: "Has reserved qty" },
  { value: "inactive_item", label: "Inactive item" },
];

type BranchCol = { id: number; name: string };

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

function itemHref(code: string) {
  return `/app/inventory/items?q=${encodeURIComponent(code)}`;
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
  const pageSize = 50;
  let qDebounce: ReturnType<typeof setTimeout> | undefined;

  const [categories] = createResource(async () => {
    const res = await apiFetch<CategoryOpt[]>("/api/v1/inventory/item-categories");
    return res.success ? (res.data ?? []) : [];
  });
  const [locations] = createResource(async () => {
    const res = await apiFetch<LocationOpt[]>("/api/v1/inventory/locations?page=1&pageSize=200");
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

  /** Always show every non-RMA branch as a column so stock is comparable side-by-side. */
  const branchCols = createMemo((): BranchCol[] => {
    const locs = (locations() ?? []).filter((l) => !l.is_rma);
    const fromMaster = locs.map((l) => ({ id: l.id, name: l.location_name }));
    if (fromMaster.length > 0) return fromMaster;
    const seen = new Map<number, string>();
    for (const r of report.data?.rows ?? []) {
      if (!seen.has(r.location_id)) seen.set(r.location_id, r.branch_name || r.location_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

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

  return (
    <ReportPageLayout
      title="Inv Per Branch"
      description="One row per item with on-hand qty across branches (Ecount-style). Branch filter limits which items appear; columns still show every branch so you can compare. Filters apply live; F8 refreshes."
      showDateFilters={false}
      submitted={true}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      onSearch={search}
      onReset={() => {
        if (qDebounce) clearTimeout(qDebounce);
        setDraft(defaultFilters());
        setPage(1);
        setSubmitted(defaultFilters());
        setGeneratedAt(new Date());
      }}
      onExportCsv={() => void downloadReportCsv(inventoryStatusExportUrl(filters()), "find-stock.csv")}
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
                <For each={(locations() ?? []).filter((l) => !l.is_rma)}>
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
      <Show when={matrixItems().length === 0 && !report.isFetching}>
        <ReportEmptyMessage
          message={
            Object.keys(normalizeFilters(filters())).filter((k) => k !== "view").length === 0
              ? "No stock balances yet. Create qty-tracked items, then Bill (auto-receive), Purchase Receive, or Stock Entry."
              : "No stock matches these filters — try All branches or clear filters."
          }
        />
        <p class="mt-3 text-center text-sm">
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
        <div class="overflow-x-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="sticky top-0 z-10 bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="sticky left-0 z-20 min-w-[7.5rem] bg-brand-50 px-3 py-2">Item code</th>
                <th class="sticky left-[7.5rem] z-20 min-w-[12rem] bg-brand-50 px-3 py-2">Item name</th>
                <th class="px-3 py-2">Spec.</th>
                <th class="px-3 py-2 text-right">Purchase</th>
                <th class="px-3 py-2 text-right">VIP</th>
                <th class="px-3 py-2 text-right">Sales</th>
                <th class="px-3 py-2 text-right">Total</th>
                <For each={branchCols()}>{(b) => <th class="px-3 py-2 text-right whitespace-nowrap">{b.name}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={matrixItems()}>
                {(item) => {
                  const negTotal = item.total_on_hand < -0.0001;
                  return (
                    <tr class={`border-t border-stroke/60 ${negTotal ? "bg-red-50" : ""}`}>
                      <td class="sticky left-0 z-[1] bg-inherit px-3 py-2 font-medium tabular-nums">{item.item_code}</td>
                      <td class="sticky left-[7.5rem] z-[1] bg-inherit px-3 py-2">
                        <A href={itemHref(item.item_code)} class="text-brand-700 hover:underline">
                          {item.item_name}
                        </A>
                        <Show when={item.unit_code}>
                          <div class="text-[11px] text-text-secondary">{item.unit_code}</div>
                        </Show>
                      </td>
                      <td class="px-3 py-2 text-text-secondary">{item.category_name || "—"}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{formatMoney(item.purchase_price)}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{formatMoney(item.vip_price)}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{formatMoney(item.sales_price)}</td>
                      <td
                        class={`px-3 py-2 text-right tabular-nums font-medium ${negTotal ? "text-red-700" : ""}`}
                      >
                        {fmtQty(item.total_on_hand)}
                      </td>
                      <For each={branchCols()}>
                        {(b) => {
                          const cell = item.byLocation.get(b.id);
                          const qty = cell?.qty_on_hand;
                          const empty = qty == null || Math.abs(qty) < 0.0000001;
                          const neg = (qty ?? 0) < -0.0001;
                          return (
                            <td
                              class={`px-3 py-2 text-right tabular-nums ${neg ? "bg-red-50 text-red-700" : ""}`}
                            >
                              <Show when={!empty} fallback={<span class="text-text-secondary"> </span>}>
                                <div class="inline-flex items-center justify-end gap-1">
                                  <A
                                    href={ledgerHref(item.item_id, b.id)}
                                    class="hover:underline"
                                    title={`Movements — ${b.name}`}
                                  >
                                    {fmtQty(qty!)}
                                  </A>
                                  <Show when={cell?.track_serial && (cell?.serial_unit_count ?? 0) > 0}>
                                    <button
                                      type="button"
                                      class="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700"
                                      onClick={() => openSerials(item, b.id, b.name)}
                                    >
                                      {cell!.serial_unit_count} sn
                                    </button>
                                  </Show>
                                </div>
                              </Show>
                            </td>
                          );
                        }}
                      </For>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </ReportPageLayout>
  );
}
