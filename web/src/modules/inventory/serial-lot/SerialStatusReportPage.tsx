import { createSignal, For, onMount, Show } from "solid-js";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { DateInput } from "../../../shared/DateInput";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  serialStatusExportUrl,
  useSerialStatusReport,
  type SerialStatusDetailRow,
  type SerialStatusFilters,
  type SerialStatusSummaryRow,
} from "../../../shared/useSerialReports";
import { SerialLotLayout } from "./SerialLotLayout";
import { SERIAL_STATUS_OPTIONS, serialStatusLabel } from "./serialRegistryFilters";
import { SERIAL_SLIP_TYPE_OPTIONS } from "../../../shared/itemMasterConstants";

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "received", label: "Received" },
  { value: "transferred", label: "Transferred" },
  { value: "sold", label: "Sold" },
  { value: "reserved", label: "Reserved" },
  { value: "returned", label: "Returned" },
  { value: "voided", label: "Voided" },
];

function defaultFilters(): SerialStatusFilters {
  return { view: "details", q: "", serial_no: "", status: "", event_type: "", ref_type: "", date_from: "", date_to: "", validity_from: "", validity_to: "" };
}

function withRowIds<T extends object>(rows: T[], page: number, pageSize: number): (T & { id: number })[] {
  return rows.map((r, i) => ({ ...r, id: page * pageSize + i + 1 }));
}

export default function SerialStatusReportPage() {
  const [draft, setDraft] = createSignal<SerialStatusFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<SerialStatusFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("serial_no");
  const [order, setOrder] = createSignal<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const report = useSerialStatusReport(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      filters: f,
      enabled: true,
    };
  });

  const patch = (p: Partial<SerialStatusFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmitted({ ...draft() });
    setPage(1);
  };

  const reset = () => {
    const defaults = defaultFilters();
    setDraft(defaults);
    setSubmitted(defaults);
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

  const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : "—");
  const isSummary = () => (submitted()?.view ?? "details") === "summary";

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Serial Status"
        description="Status and event activity by serial — Search (F8)."
        actions={
          <>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={() => void downloadReportCsv(serialStatusExportUrl(submitted()), "serial-status.csv")}
            >
              Export CSV
            </button>
          </>
        }
      >
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view !== "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "details" })}
          >
            Details
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view === "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "summary" })}
          >
            Summary
          </button>
        </div>
        <div class="mb-4 flex flex-wrap gap-1.5">
          <For each={SERIAL_SLIP_TYPE_OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class={`rounded-full px-2.5 py-1 text-xs ${
                  (draft().ref_type ?? "") === opt.value
                    ? "bg-brand-600 text-white"
                    : "border border-stroke text-text-secondary hover:bg-slate-50"
                }`}
                onClick={() => patch({ ref_type: opt.value || undefined })}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input class={inputClass} value={draft().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} placeholder="Serial, item…" />
          </Field>
          <Field label="Serial no.">
            <input class={inputClass} value={draft().serial_no ?? ""} onInput={(e) => patch({ serial_no: e.currentTarget.value })} />
          </Field>
          <Field label="Status">
            <select class={inputClass} value={draft().status ?? ""} onChange={(e) => patch({ status: e.currentTarget.value || undefined })}>
              {SERIAL_STATUS_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Show when={draft().view !== "summary"}>
            <Field label="Slip / event type">
              <select class={inputClass} value={draft().event_type ?? ""} onChange={(e) => patch({ event_type: e.currentTarget.value || undefined })}>
                {EVENT_TYPE_OPTIONS.map((o) => (
                  <option value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </Show>
          <Field label="Activity from">
            <DateInput value={draft().date_from ?? ""} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
          </Field>
          <Field label="Activity to">
            <DateInput value={draft().date_to ?? ""} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
          </Field>
          <Field label="Warranty valid from">
            <DateInput value={draft().validity_from ?? ""} onInput={(e) => patch({ validity_from: e.currentTarget.value })} />
          </Field>
          <Field label="Warranty valid to">
            <DateInput value={draft().validity_to ?? ""} onInput={(e) => patch({ validity_to: e.currentTarget.value })} />
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <div class="mt-6">
        <Show
          when={isSummary()}
          fallback={
            <SpreadsheetGrid<SerialStatusDetailRow>
              columns={[
                { key: "serial_no", header: "Serial no.", clickable: true },
                { key: "item_code", header: "Item code" },
                { key: "item_name", header: "Item name" },
                { key: "status", header: "Status", render: (r) => serialStatusLabel(r.status) },
                { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
                { key: "warranty_end", header: "Warranty end", render: (r) => fmtDate(r.warranty_end) },
                { key: "last_event_type", header: "Last event", render: (r) => r.last_event_type ?? "—" },
                { key: "last_event_at", header: "Last event at", render: (r) => (r.last_event_at ? r.last_event_at.slice(0, 19).replace("T", " ") : "—") },
                { key: "event_count", header: "Events in period" },
              ]}
              rows={(report.data?.rows ?? []) as SerialStatusDetailRow[]}
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
          <SpreadsheetGrid<SerialStatusSummaryRow & { id: number }>
            columns={[
              { key: "item_code", header: "Item code" },
              { key: "item_name", header: "Item name" },
              { key: "status", header: "Status", render: (r) => serialStatusLabel(r.status) },
              { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
              { key: "unit_count", header: "Units" },
            ]}
            rows={withRowIds((report.data?.rows ?? []) as SerialStatusSummaryRow[], page(), pageSize)}
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
    </SerialLotLayout>
  );
}
