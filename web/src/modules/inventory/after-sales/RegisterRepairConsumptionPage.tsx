import { createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { AfterSalesLayout } from "./AfterSalesLayout";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type ConsumptionRow = {
  id: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  total_qty: number;
  line_count: number;
};

export default function RegisterRepairConsumptionPage() {
  const [dateFrom, setDateFrom] = createSignal(monthStartISO());
  const [dateTo, setDateTo] = createSignal(todayISO());
  const [submitted, setSubmitted] = createSignal<{ date_from: string; date_to: string } | null>(null);

  const report = createQuery(() => ({
    queryKey: ["repair-consumption", submitted()],
    enabled: submitted() !== null,
    queryFn: async () => {
      const f = submitted()!;
      const qs = new URLSearchParams({ date_from: f.date_from, date_to: f.date_to });
      const res = await apiFetch<Omit<ConsumptionRow, "id">[]>(`/api/v1/inventory/repair-registrations/consumption-report?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load consumption report");
      return (res.data ?? []).map((row, i) => ({ ...row, id: i + 1 }));
    },
  }));

  const search = () => {
    setSubmitted({ date_from: dateFrom(), date_to: dateTo() });
  };

  const totalQty = () => (report.data ?? []).reduce((sum, r) => sum + r.total_qty, 0);

  return (
    <AfterSalesLayout>
      <div class="mb-4 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <p class="mb-1 text-sm font-medium text-text-primary">A/S Consumption Status</p>
        <p class="mb-3 text-xs text-text-secondary">Parts used from repair order lines (qty &gt; 0), grouped by item.</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Repair order date from">
            <input type="date" class={inputClass} value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
          </Field>
          <Field label="Repair order date to">
            <input type="date" class={inputClass} value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
          </Field>
        </div>
        <div class="mt-3 flex gap-2">
          <button type="button" class="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={search}>
            Search
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm"
            onClick={() => {
              setDateFrom(monthStartISO());
              setDateTo(todayISO());
              setSubmitted(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <Show when={submitted()}>
        <p class="mb-2 text-sm text-text-secondary">Total quantity: {totalQty().toFixed(4)}</p>
        <SpreadsheetGrid
          columns={[
            { key: "item_code", header: "Item Code" },
            { key: "item_name", header: "Item Name" },
            { key: "total_qty", header: "Total Qty", render: (r) => r.total_qty.toFixed(4) },
            { key: "line_count", header: "Line Count" },
          ]}
          rows={report.data ?? []}
          loading={report.isFetching}
          selectedId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onNew={() => {}}
          codeKey="item_code"
          nameKey="item_name"
        />
      </Show>
    </AfterSalesLayout>
  );
}
