import { createSignal, onMount } from "solid-js";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { DateInput } from "../../../shared/DateInput";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  serialBalanceExportUrl,
  useSerialBalanceReport,
  type SerialBalanceFilters,
  type SerialBalanceRow,
} from "../../../shared/useSerialReports";
import { SerialLotLayout } from "./SerialLotLayout";
import { SERIAL_STATUS_OPTIONS, serialStatusLabel } from "./serialRegistryFilters";

const INVENTORY_QTY_OPTIONS = [
  { value: "", label: "All" },
  { value: "1", label: "1" },
  { value: "0", label: "0" },
  { value: "others", label: "Others" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFilters(): SerialBalanceFilters {
  return {
    view: "serial",
    as_of: todayISO(),
    q: "",
    serial_no: "",
    status: "",
    inventory_qty: "",
    include_void: true,
  };
}

function withRowIds<T extends object>(rows: T[], page: number, pageSize: number): (T & { id: number })[] {
  return rows.map((r, i) => ({ ...r, id: page * pageSize + i + 1 }));
}

export default function SerialBalanceReportPage() {
  const [draft, setDraft] = createSignal<SerialBalanceFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<SerialBalanceFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("serial_no");
  const [order, setOrder] = createSignal<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const report = useSerialBalanceReport(() => {
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

  const patch = (p: Partial<SerialBalanceFilters>) => setDraft((prev) => ({ ...prev, ...p }));

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

  const withIds = (rows: SerialBalanceRow[]) => withRowIds(rows, page(), pageSize);

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

  return (
    <SerialLotLayout>
      <CollapsibleFilterPanel
        title="Serial Inv. Balance"
        description="As-of quantity by serial — Search (F8)."
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
              onClick={() => void downloadReportCsv(serialBalanceExportUrl(submitted()), "serial-inv-balance.csv")}
            >
              Export CSV
            </button>
          </>
        }
      >
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view !== "by_location" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "serial" })}
          >
            Serial / Lot No.
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view === "by_location" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "by_location" })}
          >
            By location
          </button>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="As-of date">
            <DateInput value={draft().as_of ?? ""} onInput={(e) => patch({ as_of: e.currentTarget.value })} />
          </Field>
          <Field label="Inventory qty">
            <select class={inputClass} value={draft().inventory_qty ?? ""} onChange={(e) => patch({ inventory_qty: e.currentTarget.value || undefined })}>
              {INVENTORY_QTY_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
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
          <Field label="Include void">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft().include_void ?? false} onChange={(e) => patch({ include_void: e.currentTarget.checked })} />
              Include deactivated serials
            </label>
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <div class="mt-6">
        <SpreadsheetGrid<SerialBalanceRow & { id: number }>
          columns={[
            { key: "serial_no", header: "Serial no.", clickable: true },
            { key: "item_code", header: "Item code" },
            { key: "item_name", header: "Item name" },
            { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
            { key: "qty_on_hand", header: "Qty on hand", render: (r) => String(r.qty_on_hand) },
            { key: "status", header: "Status", render: (r) => serialStatusLabel(r.status) },
          ]}
          rows={withIds(report.data?.rows ?? [])}
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
      </div>
    </SerialLotLayout>
  );
}
