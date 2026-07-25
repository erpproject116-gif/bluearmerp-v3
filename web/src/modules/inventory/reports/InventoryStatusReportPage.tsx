import { createSignal, For, onMount, Show, createResource } from "solid-js";
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

type CategoryOpt = { id: number; name: string };
type LocationOpt = { id: number; location_name: string };

const STOCK_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "in_stock", label: "In stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "below_safety", label: "Below safety" },
  { value: "has_reserved", label: "Has reserved qty" },
  { value: "inactive_item", label: "Inactive item" },
];

function statusLabel(code: string) {
  return STOCK_STATUS_OPTIONS.find((o) => o.value === code)?.label ?? code.replaceAll("_", " ");
}

function defaultFilters(): InventoryStatusFilters {
  return {};
}

function ledgerHref(r: InventoryStatusRow) {
  const qs = new URLSearchParams({
    item_id: String(r.item_id),
    location_id: String(r.location_id),
  });
  return `/app/inventory/reports/stock-ledger?${qs}`;
}

function itemHref(r: InventoryStatusRow) {
  return `/app/inventory/items?q=${encodeURIComponent(r.item_code)}`;
}

function normalizeFilters(raw: InventoryStatusFilters): InventoryStatusFilters {
  const next: InventoryStatusFilters = { ...raw };
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
  const out: InventoryStatusFilters = {};
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
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";
}

export default function InventoryStatusReportPage() {
  const [searchParams] = useSearchParams();
  const [draft, setDraft] = createSignal<InventoryStatusFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<InventoryStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const [categories] = createResource(async () => {
    const res = await apiFetch<CategoryOpt[]>("/api/v1/inventory/item-categories");
    return res.success ? (res.data ?? []) : [];
  });
  const [locations] = createResource(async () => {
    const res = await apiFetch<LocationOpt[]>("/api/v1/inventory/locations?page=1&pageSize=200");
    return res.success ? (res.data ?? []) : [];
  });

  const report = useInventoryStatusReport(() => ({
    filters: submitted() ?? defaultFilters(),
    page: page(),
    pageSize,
    sort: "item_code",
    order: "asc",
    enabled: submitted() !== null,
  }));

  const search = () => {
    const next = normalizeFilters(draft());
    setSubmitted(next);
    setPage(1);
    setGeneratedAt(new Date());
  };

  onMount(() => {
    const fromUrl = filtersFromSearchParams(searchParams);
    if (Object.keys(fromUrl).length > 0) {
      setDraft(fromUrl);
      setSubmitted(normalizeFilters(fromUrl));
      setGeneratedAt(new Date());
    } else {
      search();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const patch = (p: Partial<InventoryStatusFilters>) => setDraft((prev) => ({ ...prev, ...p }));
  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));
  const filters = () => submitted() ?? draft();

  return (
    <ReportPageLayout
      title="Find Stock"
      description="Cross-branch inquiry: qty, price, and company total. Balances update from stock movements — Search (F8)."
      showDateFilters={false}
      submitted={submitted() !== null}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      onSearch={search}
      onReset={() => {
        setDraft(defaultFilters());
        setSubmitted(null);
        setPage(1);
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
                onInput={(e) => patch({ q: e.currentTarget.value })}
              />
            </Field>
            <Field label="Branch">
              <select
                class={inputClass}
                value={draft().location_id ?? ""}
                onChange={(e) =>
                  patch({ location_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
                }
              >
                <option value="">All branches</option>
                <For each={locations() ?? []}>{(l) => <option value={l.id}>{l.location_name}</option>}</For>
              </select>
            </Field>
            <Field label="Category">
              <select
                class={inputClass}
                value={draft().category_id ?? ""}
                onChange={(e) =>
                  patch({ category_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
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
                onChange={(e) => patch({ status: e.currentTarget.value || undefined })}
              >
                <For each={STOCK_STATUS_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
              </select>
            </Field>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={Boolean(draft().in_stock_only)}
              onChange={(e) => patch({ in_stock_only: e.currentTarget.checked ? 1 : undefined })}
            />
            In stock only (available &gt; 0)
          </label>
        </div>
      }
    >
      <Show when={(report.data?.rows.length ?? 0) === 0 && submitted() !== null && !report.isFetching}>
        <ReportEmptyMessage message="No stock matches — try All branches or clear filters." />
      </Show>
      <Show when={(report.data?.rows.length ?? 0) > 0}>
        <div class="overflow-x-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="sticky top-0 bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Unit</th>
                <th class="px-3 py-2">Branch</th>
                <th class="px-3 py-2 text-right">On hand</th>
                <th class="px-3 py-2 text-right">Reserved</th>
                <th class="px-3 py-2 text-right">Available</th>
                <th class="px-3 py-2 text-right">Sales price</th>
                <th class="px-3 py-2 text-right">Company avail.</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={report.data?.rows ?? []}>
                {(r) => {
                  const muted = r.available_qty <= 0;
                  const otherBranches = r.available_qty <= 0 && r.company_available_qty > 0;
                  return (
                    <tr class={`border-t border-stroke/60 ${muted ? "text-text-secondary" : ""}`}>
                      <td class="px-3 py-2">
                        <div class="font-medium text-text-primary">{r.item_code}</div>
                        <div class="text-xs text-text-secondary">{r.item_name}</div>
                        <Show when={r.category_name}>
                          <div class="text-[11px] text-text-secondary">{r.category_name}</div>
                        </Show>
                      </td>
                      <td class="px-3 py-2">{r.unit_code || "—"}</td>
                      <td class="px-3 py-2">{r.branch_name}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty_on_hand)}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{fmtQty(r.qty_reserved)}</td>
                      <td class="px-3 py-2 text-right tabular-nums">
                        <div>{fmtQty(r.available_qty)}</div>
                        <Show when={otherBranches}>
                          <div class="text-[11px] text-amber-700">Other branches</div>
                        </Show>
                      </td>
                      <td class="px-3 py-2 text-right tabular-nums">{formatMoney(r.sales_price)}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{fmtQty(r.company_available_qty)}</td>
                      <td class="px-3 py-2">{statusLabel(r.stock_status)}</td>
                      <td class="px-3 py-2">
                        <div class="flex flex-col gap-0.5 text-xs">
                          <A href={itemHref(r)} class="text-brand-600 hover:underline">
                            Open item
                          </A>
                          <A href={ledgerHref(r)} class="text-brand-600 hover:underline">
                            Movements
                          </A>
                          <Show when={r.track_serial}>
                            <A
                              href={`/app/inventory/serial-lot/registry?q=${encodeURIComponent(r.item_code)}`}
                              class="text-brand-600 hover:underline"
                            >
                              Serials
                            </A>
                          </Show>
                        </div>
                      </td>
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
