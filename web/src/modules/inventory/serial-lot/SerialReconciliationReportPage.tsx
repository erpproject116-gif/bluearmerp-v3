import { createSignal, onMount, Show } from "solid-js";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  serialReconciliationExportUrl,
  useSerialReconciliationReport,
  type SerialReconciliationFilters,
  type SerialReconciliationRow,
} from "../../../shared/useSerialReports";
import { SerialLotLayout } from "./SerialLotLayout";

function defaultFilters(): SerialReconciliationFilters {
  return { compare_by: "serial", q: "", mismatches_only: true };
}

function withRowIds<T extends object>(rows: T[], page: number, pageSize: number): (T & { id: number })[] {
  return rows.map((r, i) => ({ ...r, id: page * pageSize + i + 1 }));
}

export default function SerialReconciliationReportPage() {
  const [draft, setDraft] = createSignal<SerialReconciliationFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<SerialReconciliationFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("variance");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const report = useSerialReconciliationReport(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      filters: f ?? defaultFilters(),
      enabled: f != null,
    };
  });

  const patch = (p: Partial<SerialReconciliationFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmitted({ ...draft() });
    setPage(1);
  };

  const reset = () => {
    setDraft(defaultFilters());
    setSubmitted(null);
    setPage(1);
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isByItem = () => (submitted()?.compare_by ?? "serial") === "item";

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Item vs Serial Balance</h2>
          <p class="text-sm text-text-secondary">Compare item on-hand qty vs in-stock serial unit count — Search (F8).</p>
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().compare_by !== "item" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ compare_by: "serial" })}
          >
            By serial
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().compare_by === "item" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ compare_by: "item" })}
          >
            By item
          </button>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input class={inputClass} value={draft().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} placeholder="Item code, name…" />
          </Field>
          <Field label="Mismatches only">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft().mismatches_only ?? false} onChange={(e) => patch({ mismatches_only: e.currentTarget.checked })} />
              Show only rows with variance
            </label>
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={search}>
            Search (F8)
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={reset}>
            Reset
          </button>
          <Show when={submitted()}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={() => void downloadReportCsv(serialReconciliationExportUrl(submitted()!), "serial-reconciliation.csv")}
            >
              Export CSV
            </button>
          </Show>
        </div>
      </section>

      <Show when={submitted()}>
        <div class="mt-6">
          <Show
            when={isByItem()}
            fallback={
              <SpreadsheetGrid<SerialReconciliationRow & { id: number }>
                columns={[
                  { key: "serial_no", header: "Serial no.", render: (r) => r.serial_no ?? "—", clickable: true },
                  { key: "item_code", header: "Item code" },
                  { key: "item_name", header: "Item name" },
                  { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
                  { key: "item_qty_on_hand", header: "Item qty", render: (r) => String(r.item_qty_on_hand) },
                  { key: "serial_unit_count", header: "Serial count", render: (r) => String(r.serial_unit_count) },
                  { key: "variance", header: "Variance", render: (r) => String(r.variance) },
                ]}
                rows={withRowIds(report.data?.rows ?? [], page(), pageSize)}
                loading={report.isFetching}
                selectedId={selectedId()}
                onSelect={setSelectedId}
                codeKey="serial_no"
                nameKey="item_name"
                sortKey={sort()}
                sortOrder={order()}
                onSort={toggleSort}
                page={page()}
                pageSize={pageSize}
                total={report.data?.total ?? 0}
                onPageChange={setPage}
                onRefresh={search}
                onNew={() => {}}
                onEdit={() => {}}
              />
            }
          >
            <SpreadsheetGrid<SerialReconciliationRow & { id: number }>
              columns={[
                { key: "item_code", header: "Item code" },
                { key: "item_name", header: "Item name" },
                { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
                { key: "item_qty_on_hand", header: "Item qty", render: (r) => String(r.item_qty_on_hand) },
                { key: "serial_unit_count", header: "Serial count", render: (r) => String(r.serial_unit_count) },
                { key: "variance", header: "Variance", render: (r) => String(r.variance) },
              ]}
              rows={withRowIds(report.data?.rows ?? [], page(), pageSize)}
              loading={report.isFetching}
              selectedId={selectedId()}
              onSelect={setSelectedId}
              codeKey="item_code"
              nameKey="item_name"
              sortKey={sort()}
              sortOrder={order()}
              onSort={toggleSort}
              page={page()}
              pageSize={pageSize}
              total={report.data?.total ?? 0}
              onPageChange={setPage}
              onRefresh={search}
              onNew={() => {}}
              onEdit={() => {}}
            />
          </Show>
        </div>
      </Show>
    </SerialLotLayout>
  );
}
