import { createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { defaultReportDateRange, ReportPageLayout } from "../../shared/reports/ReportPageLayout";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";

type ReportTab = "work-order-status" | "progress" | "stock-movements" | "disassembly-yield" | "waste-variance";

type WoStatusRow = {
  work_order_id: number;
  work_order_no: string;
  order_date: string;
  status: string;
  inspection_status: string;
  bom_code: string;
  bom_name: string;
  bom_type?: string;
  finished_item_code: string;
  finished_item_name: string;
  location_name: string;
  qty_to_produce: number;
  qty_produced: number;
  source_sales_order_no?: string | null;
  released_at?: string | null;
  completed_at?: string | null;
};

type WoProgressRow = {
  work_order_id: number;
  work_order_no: string;
  status: string;
  bom_code?: string;
  qty_to_produce: number;
  qty_produced: number;
  progress_pct: number;
  issued_serials: number;
  issued_lot_qty: number;
  output_serials: number;
  output_lot_qty: number;
  inspection_status: string;
  source_sales_order_no?: string | null;
};

type WoStockMovementRow = {
  id: number;
  work_order_id: number;
  work_order_no: string;
  item_code: string;
  item_name: string;
  location_name: string;
  qty_delta: number;
  movement_type: string;
  created_at: string;
  source_sales_order_no?: string | null;
};

type YieldRow = {
  work_order_id: number;
  work_order_no: string;
  bom_code: string;
  component_code: string;
  component_name: string;
  output_classification?: string;
  planned_qty: number;
  actual_qty: number;
  variance_qty: number;
  actual_input_qty: number;
  qty_to_produce: number;
  band_status?: string;
};

type WasteVarianceRow = {
  work_order_id: number;
  work_order_no: string;
  bom_code: string;
  component_code?: string;
  component_name?: string;
  classification: string;
  expected_qty: number;
  actual_qty: number;
  excess_qty: number;
  waste_reason_code?: string;
  waste_reason_name?: string;
  is_abnormal: boolean;
  notes?: string;
  order_date: string;
};

type DateFilters = { date_from: string; date_to: string; status?: string; work_order_id?: number; bom_type?: string };

const TAB_LABELS: Record<ReportTab, string> = {
  "work-order-status": "Job status",
  progress: "Progress",
  "stock-movements": "Stock movements",
  "disassembly-yield": "Cutting yield",
  "waste-variance": "Waste & difference",
};

const VALID_TABS = Object.keys(TAB_LABELS) as ReportTab[];

function rawTab(params: { tab?: string | string[] }): string | null {
  const t = params.tab;
  if (Array.isArray(t)) {
    const first = t.find((x) => typeof x === "string" && x.trim().length > 0);
    return first?.trim() || null;
  }
  if (typeof t === "string" && t.trim().length > 0) return t.trim();
  return null;
}

function parseReportTab(raw: string | undefined | null): ReportTab {
  if (raw && (VALID_TABS as string[]).includes(raw)) return raw as ReportTab;
  return "work-order-status";
}

function reportPath(tab: ReportTab): string {
  switch (tab) {
    case "work-order-status":
      return "/api/v1/manufacturing/reports/work-order-status";
    case "progress":
      return "/api/v1/manufacturing/reports/progress";
    case "stock-movements":
      return "/api/v1/manufacturing/reports/stock-movements";
    case "disassembly-yield":
      return "/api/v1/manufacturing/reports/disassembly-yield";
    case "waste-variance":
      return "/api/v1/manufacturing/reports/waste-variance";
  }
}

export default function ProductionReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const client = useQueryClient();
  const defaults = defaultReportDateRange();
  const tab = () => parseReportTab(rawTab(searchParams));
  const [draftFilters, setDraftFilters] = createSignal<DateFilters>(defaults);
  const [filters, setFilters] = createSignal<DateFilters>(defaults);
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const selectTab = (t: ReportTab) => {
    setSearchParams({ tab: t }, { replace: true });
    setPage(1);
    setGeneratedAt(new Date());
    void client.invalidateQueries({ queryKey: ["mfg-report"] });
  };

  const report = createQuery(() => {
    const f = filters();
    const activeTab = tab();
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      date_from: f.date_from,
      date_to: f.date_to,
    });
    if (f.status) qs.set("status", f.status);
    if (f.bom_type) qs.set("bom_type", f.bom_type);
    if (f.work_order_id) qs.set("work_order_id", String(f.work_order_id));
    return {
      queryKey: ["mfg-report", activeTab, page(), pageSize(), f],
      queryFn: async () => {
        const res = await apiFetch<unknown[]>(`${reportPath(activeTab)}?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      enabled: submitted(),
    };
  });

  const search = () => {
    setFilters({ ...draftFilters() });
    setSubmitted(true);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const patch = (p: Partial<DateFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

  onMount(() => {
    // Only rewrite invalid ?tab= values. Never invent a default when tab is missing —
    // that raced with sidebar deep-links (?tab=waste-variance) and wiped them.
    const raw = rawTab(searchParams);
    if (raw && !(VALID_TABS as string[]).includes(raw)) {
      setSearchParams({ tab: parseReportTab(raw) }, { replace: true });
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <>
      <div class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Production reports">
        <For each={VALID_TABS}>
          {(t) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === t}
              class={`rounded-lg px-3 py-1.5 text-sm ${tab() === t ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
              onClick={() => selectTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          )}
        </For>
      </div>

      <ReportPageLayout
        title={TAB_LABELS[tab()]}
        description="Production reports for jobs (work orders): status, progress (planned vs weighed lots), stock movements, cutting yield, and waste. Set date range and filters, then Search (F8)."
        dateFrom={() => draftFilters().date_from}
        dateTo={() => draftFilters().date_to}
        onDateFromChange={(v) => patch({ date_from: v })}
        onDateToChange={(v) => patch({ date_to: v })}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
        onSearch={search}
        onReset={() => {
          setDraftFilters(defaults);
          setFilters(defaults);
          setSubmitted(true);
          setPage(1);
        }}
        filterExtra={
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <Show when={tab() === "work-order-status"}>
              <Field label="Type">
                <select
                  class={inputClass}
                  value={draftFilters().bom_type ?? ""}
                  onChange={(e) => patch({ bom_type: e.currentTarget.value || undefined })}
                >
                  <option value="">All</option>
                  <option value="assembly">Assembly</option>
                  <option value="disassembly">Cutting</option>
                  <option value="recipe">Recipe</option>
                </select>
              </Field>
            </Show>
            <Show when={tab() !== "stock-movements"}>
              <Field label="WO status">
                <select
                  class={inputClass}
                  value={draftFilters().status ?? ""}
                  onChange={(e) => patch({ status: e.currentTarget.value || undefined })}
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="released">Released</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </Show>
            <Show when={tab() === "stock-movements"}>
              <Field label="Work order ID">
                <input
                  type="number"
                  class={inputClass}
                  value={draftFilters().work_order_id ?? ""}
                  onInput={(e) =>
                    patch({
                      work_order_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined,
                    })
                  }
                />
              </Field>
            </Show>
          </div>
        }
      >
        <Show when={report.isError}>
          <p class="mx-5 my-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {(report.error as Error)?.message ?? "Failed to load report."} Try Search (F8) again or widen the date range.
          </p>
        </Show>

        <Show when={tab() === "work-order-status"}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">WO no.</th>
                <th class="px-3 py-2">Date</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Inspection</th>
                <th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Recipe</th>
                <th class="px-3 py-2">Finished item</th>
                <th class="px-3 py-2">Location</th>
                <th class="px-3 py-2 text-right">Qty</th>
                <th class="px-3 py-2 text-right">Produced</th>
                <th class="px-3 py-2">Source SO</th>
              </tr>
            </thead>
            <tbody>
              <For each={(report.data?.rows ?? []) as WoStatusRow[]}>
                {(row) => (
                  <tr
                    class="cursor-pointer border-t border-stroke/60 hover:bg-brand-50/40"
                    onClick={() => {
                      const branch = row.bom_type === "disassembly" ? "disassembly" : "assembly";
                      window.location.href = `/app/production/${branch}/jobs?status=${encodeURIComponent(row.status)}`;
                    }}
                    title="Open jobs list"
                  >
                    <td class="px-3 py-2">
                      <a
                        class="text-brand-700 underline-offset-2 hover:underline"
                        href={`/app/production/${
                          row.bom_type === "disassembly"
                            ? "disassembly"
                            : row.bom_type === "recipe"
                              ? "recipe"
                              : "assembly"
                        }/jobs?status=${encodeURIComponent(row.status)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.work_order_no}
                      </a>
                    </td>
                    <td class="px-3 py-2">{row.order_date?.slice(0, 10)}</td>
                    <td class="px-3 py-2 capitalize">{row.status.replace(/_/g, " ")}</td>
                    <td class="px-3 py-2 capitalize">{row.inspection_status.replace(/_/g, " ")}</td>
                    <td class="px-3 py-2 capitalize">
                      {row.bom_type === "disassembly"
                        ? "Cutting"
                        : row.bom_type === "recipe"
                          ? "Recipe"
                          : "Assembly"}
                    </td>
                    <td class="px-3 py-2">{row.bom_code}</td>
                    <td class="px-3 py-2">{row.finished_item_code} — {row.finished_item_name}</td>
                    <td class="px-3 py-2">{row.location_name}</td>
                    <td class="px-3 py-2 text-right">{row.qty_to_produce}</td>
                    <td class="px-3 py-2 text-right">{row.qty_produced}</td>
                    <td class="px-3 py-2">{row.source_sales_order_no ?? "—"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={tab() === "progress"}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">WO no.</th>
                <th class="px-3 py-2">Recipe</th>
                <th class="px-3 py-2">Source SO</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2 text-right">To produce</th>
                <th class="px-3 py-2 text-right">Produced</th>
                <th class="px-3 py-2 text-right">Progress %</th>
                <th class="px-3 py-2 text-right">Issued serials</th>
                <th class="px-3 py-2 text-right">Issued lot qty</th>
                <th class="px-3 py-2 text-right">Output serials</th>
                <th class="px-3 py-2 text-right">Output lot qty</th>
                <th class="px-3 py-2">Inspection</th>
              </tr>
            </thead>
            <tbody>
              <For each={(report.data?.rows ?? []) as WoProgressRow[]}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">{row.work_order_no}</td>
                    <td class="px-3 py-2">{row.bom_code ?? "—"}</td>
                    <td class="px-3 py-2">{row.source_sales_order_no ?? "—"}</td>
                    <td class="px-3 py-2 capitalize">{row.status.replace(/_/g, " ")}</td>
                    <td class="px-3 py-2 text-right">{row.qty_to_produce}</td>
                    <td class="px-3 py-2 text-right">{row.qty_produced}</td>
                    <td class="px-3 py-2 text-right">{row.progress_pct.toFixed(1)}%</td>
                    <td class="px-3 py-2 text-right">{row.issued_serials}</td>
                    <td class="px-3 py-2 text-right">{row.issued_lot_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 text-right">{row.output_serials}</td>
                    <td class="px-3 py-2 text-right">{row.output_lot_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 capitalize">{row.inspection_status.replace(/_/g, " ")}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={tab() === "stock-movements"}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Date</th>
                <th class="px-3 py-2">WO no.</th>
                <th class="px-3 py-2">Source SO</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Location</th>
                <th class="px-3 py-2 text-right">Qty delta</th>
                <th class="px-3 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              <For each={(report.data?.rows ?? []) as WoStockMovementRow[]}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">{row.created_at?.slice(0, 19).replace("T", " ")}</td>
                    <td class="px-3 py-2">{row.work_order_no}</td>
                    <td class="px-3 py-2">{row.source_sales_order_no ?? "—"}</td>
                    <td class="px-3 py-2">{row.item_code} — {row.item_name}</td>
                    <td class="px-3 py-2">{row.location_name}</td>
                    <td class="px-3 py-2 text-right">{row.qty_delta.toFixed(4)}</td>
                    <td class="px-3 py-2">{row.movement_type}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={tab() === "disassembly-yield"}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Job no.</th>
                <th class="px-3 py-2">Template</th>
                <th class="px-3 py-2">Cut SKU</th>
                <th class="px-3 py-2">Class</th>
                <th class="px-3 py-2 text-right">Planned</th>
                <th class="px-3 py-2 text-right">Actual</th>
                <th class="px-3 py-2 text-right">Difference</th>
                <th class="px-3 py-2">Yield band</th>
                <th class="px-3 py-2 text-right">Actual input</th>
              </tr>
            </thead>
            <tbody>
              <For each={(report.data?.rows ?? []) as YieldRow[]}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">{row.work_order_no}</td>
                    <td class="px-3 py-2">{row.bom_code}</td>
                    <td class="px-3 py-2">{row.component_code} — {row.component_name}</td>
                    <td class="px-3 py-2">{row.output_classification ?? "finished"}</td>
                    <td class="px-3 py-2 text-right">{row.planned_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 text-right">{row.actual_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 text-right">{row.variance_qty.toFixed(4)}</td>
                    <td class="px-3 py-2">{row.band_status ?? "n/a"}</td>
                    <td class="px-3 py-2 text-right">{row.actual_input_qty.toFixed(4)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={tab() === "waste-variance"}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Date</th>
                <th class="px-3 py-2">Job no.</th>
                <th class="px-3 py-2">Template</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2 text-right">Expected</th>
                <th class="px-3 py-2 text-right">Actual</th>
                <th class="px-3 py-2 text-right">Excess</th>
                <th class="px-3 py-2">Reason</th>
                <th class="px-3 py-2">Abnormal</th>
              </tr>
            </thead>
            <tbody>
              <For each={(report.data?.rows ?? []) as WasteVarianceRow[]}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">{row.order_date?.slice(0, 10)}</td>
                    <td class="px-3 py-2">{row.work_order_no}</td>
                    <td class="px-3 py-2">{row.bom_code}</td>
                    <td class="px-3 py-2">
                      {row.component_code ? `${row.component_code} — ${row.component_name}` : "—"}
                    </td>
                    <td class="px-3 py-2 text-right">{row.expected_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 text-right">{row.actual_qty.toFixed(4)}</td>
                    <td class="px-3 py-2 text-right">{row.excess_qty.toFixed(4)}</td>
                    <td class="px-3 py-2">
                      {row.waste_reason_code
                        ? `${row.waste_reason_code} — ${row.waste_reason_name}`
                        : "—"}
                    </td>
                    <td class="px-3 py-2">{row.is_abnormal ? "Yes" : "No"}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>

        <Show when={submitted() && !report.isError && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">
            No {TAB_LABELS[tab()]} rows in this date range.
          </p>
        </Show>
      </ReportPageLayout>
    </>
  );
}
