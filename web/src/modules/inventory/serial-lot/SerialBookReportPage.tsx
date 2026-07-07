import { createSignal, onMount, Show } from "solid-js";
import { DateInput } from "../../../shared/DateInput";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  defaultSerialBookDateRange,
  serialBookExportUrl,
  useSerialBookReport,
  type SerialBookDetailRow,
  type SerialBookFilters,
  type SerialBookSummaryRow,
} from "../../../shared/useSerialReports";
import { SerialLotLayout } from "./SerialLotLayout";

function defaultFilters(): SerialBookFilters {
  const range = defaultSerialBookDateRange();
  return { view: "general", ...range, q: "", serial_no: "", event_type: "" };
}

function withRowIds<T extends object>(rows: T[], page: number, pageSize: number): (T & { id: number })[] {
  return rows.map((r, i) => ({ ...r, id: page * pageSize + i + 1 }));
}

export default function SerialBookReportPage() {
  const [draft, setDraft] = createSignal<SerialBookFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<SerialBookFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("created_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const report = useSerialBookReport(() => {
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

  const patch = (p: Partial<SerialBookFilters>) => setDraft((prev) => ({ ...prev, ...p }));

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

  const isSummary = () => (submitted()?.view ?? "general") === "summary";

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Serial Inv. Book</h2>
          <p class="text-sm text-text-secondary">Opening, issue, and closing per serial in a date range — Search (F8).</p>
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view !== "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "general" })}
          >
            General
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view === "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "summary" })}
          >
            Summary by serial
          </button>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Date from">
            <DateInput value={draft().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
          </Field>
          <Field label="Date to">
            <DateInput value={draft().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
          </Field>
          <Field label="Keyword">
            <input class={inputClass} value={draft().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} placeholder="Serial, item…" />
          </Field>
          <Field label="Serial no.">
            <input class={inputClass} value={draft().serial_no ?? ""} onInput={(e) => patch({ serial_no: e.currentTarget.value })} />
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
              onClick={() => void downloadReportCsv(serialBookExportUrl(submitted()!), "serial-inv-book.csv")}
            >
              Export CSV
            </button>
          </Show>
        </div>
      </section>

      <Show when={submitted()}>
        <div class="mt-6">
          <Show
            when={isSummary()}
            fallback={
              <SpreadsheetGrid<SerialBookDetailRow>
                columns={[
                  { key: "created_at", header: "When", render: (r) => r.created_at.slice(0, 19).replace("T", " ") },
                  { key: "serial_no", header: "Serial no.", clickable: true },
                  { key: "item_code", header: "Item code" },
                  { key: "item_name", header: "Item name" },
                  { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
                  { key: "event_type", header: "Event" },
                  { key: "qty_delta", header: "Qty Δ", render: (r) => String(r.qty_delta) },
                  { key: "ref_type", header: "Ref", render: (r) => r.ref_type ?? "—" },
                ]}
                rows={(report.data?.rows ?? []) as SerialBookDetailRow[]}
                loading={report.isFetching}
                selectedId={selectedId()}
                onSelect={setSelectedId}
                codeKey="serial_no"
                nameKey="event_type"
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
            <SpreadsheetGrid<SerialBookSummaryRow & { id: number }>
              columns={[
                { key: "serial_no", header: "Serial no.", clickable: true },
                { key: "item_code", header: "Item code" },
                { key: "item_name", header: "Item name" },
                { key: "opening_qty", header: "Opening", render: (r) => String(r.opening_qty) },
                { key: "received_qty", header: "Received", render: (r) => String(r.received_qty) },
                { key: "issued_qty", header: "Issued", render: (r) => String(r.issued_qty) },
                { key: "closing_qty", header: "Closing", render: (r) => String(r.closing_qty) },
              ]}
              rows={withRowIds((report.data?.rows ?? []) as SerialBookSummaryRow[], page(), pageSize)}
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
          </Show>
        </div>
      </Show>
    </SerialLotLayout>
  );
}
