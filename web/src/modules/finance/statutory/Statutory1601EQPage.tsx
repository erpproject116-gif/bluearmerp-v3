import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { formatMoney } from "../../../shared/money";
import { downloadApiFile } from "../../../shared/reports/downloadReportCsv";
import { useToast } from "../../../shared/toast";

type Row = {
  atc_code: string;
  description: string;
  rate_pct: number;
  payee_tin: string;
  payee_name: string;
  total_base: number;
  total_tax: number;
};

type Workpaper = {
  period_from: string;
  period_to: string;
  rows: Row[];
  total_base: number;
  total_tax: number;
  disclaimer: string;
};

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Statutory1601EQPage() {
  const toast = useToast();
  const [periodFrom, setPeriodFrom] = createSignal(monthStartISO());
  const [periodTo, setPeriodTo] = createSignal(new Date().toISOString().slice(0, 10));
  const [runKey, setRunKey] = createSignal(0);

  const workpaper = createQuery(() => ({
    queryKey: ["statutory-1601-eq", periodFrom(), periodTo(), runKey()],
    enabled: runKey() > 0,
    queryFn: async () => {
      const qs = new URLSearchParams({ period_from: periodFrom(), period_to: periodTo() });
      const res = await apiFetch<Workpaper>(`/api/v1/finance/statutory/1601-eq?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load workpaper");
      return res.data!;
    },
  }));

  const downloadAlphalist = async () => {
    const qs = new URLSearchParams({ period_from: periodFrom(), period_to: periodTo() });
    const result = await downloadApiFile(`/api/v1/finance/statutory/alphalist-ewt?${qs}`, `alphalist-ewt_${periodFrom()}_${periodTo()}.csv`);
    if (!result.ok) toast.warning(result.error ?? "Download failed.");
  };

  const load = () => {
    if (!periodFrom() || !periodTo()) {
      toast.warning("Period from and to are required.");
      return;
    }
    setRunKey((k) => k + 1);
  };

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>1601-EQ workpaper</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">1601-EQ expanded withholding workpaper</h2>
        <p class="mt-1 text-sm text-text-secondary">{workpaper.data?.disclaimer ?? "For accountant review — not a BIR e-filing submission."}</p>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Period from">
            <input class={inputClass} type="date" value={periodFrom()} onInput={(e) => setPeriodFrom(e.currentTarget.value)} />
          </Field>
          <Field label="Period to">
            <input class={inputClass} type="date" value={periodTo()} onInput={(e) => setPeriodTo(e.currentTarget.value)} />
          </Field>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={load}>
            Load workpaper
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium" onClick={() => void downloadAlphalist()}>
            Download alphalist CSV
          </button>
        </div>
      </section>
      <Show when={workpaper.isFetching}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={workpaper.data}>
        {(data) => (
          <div class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-left">
                <tr>
                  <th class="px-3 py-2">ATC</th>
                  <th class="px-3 py-2">Description</th>
                  <th class="px-3 py-2 text-right">Rate %</th>
                  <th class="px-3 py-2">Payee TIN</th>
                  <th class="px-3 py-2">Payee name</th>
                  <th class="px-3 py-2 text-right">Base</th>
                  <th class="px-3 py-2 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                <For each={data().rows}>
                  {(row) => (
                    <tr class="border-b border-stroke/60">
                      <td class="px-3 py-2">{row.atc_code}</td>
                      <td class="px-3 py-2">{row.description}</td>
                      <td class="px-3 py-2 text-right">{row.rate_pct}%</td>
                      <td class="px-3 py-2">{row.payee_tin || "—"}</td>
                      <td class="px-3 py-2">{row.payee_name}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.total_base)}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.total_tax)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot class="border-t border-stroke bg-slate-50 font-semibold">
                <tr>
                  <td class="px-3 py-2 text-right" colspan="5">
                    Total
                  </td>
                  <td class="px-3 py-2 text-right">{formatMoney(data().total_base)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(data().total_tax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Show>
    </div>
  );
}
