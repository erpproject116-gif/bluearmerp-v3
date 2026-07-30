import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { formatMoney } from "../../../shared/money";
import { downloadApiFile } from "../../../shared/reports/downloadReportCsv";
import { useToast } from "../../../shared/toast";

type RegisterRow = {
  doc_date: string;
  doc_type: string;
  doc_no: string;
  partner_name: string;
  partner_tin: string;
  vatable_amount: number;
  exempt_amount: number;
  zero_rated_amount: number;
  output_vat: number;
  input_vat: number;
};

type RegisterPayload = {
  period_from: string;
  period_to: string;
  tax_regime: string;
  vat_enabled: boolean;
  rows: RegisterRow[];
  disclaimer: string;
};

type Props = {
  mode: "sales" | "purchases";
};

const config = {
  sales: {
    title: "VAT sales register",
    apiPath: "/api/v1/finance/statutory/vat/sales-register",
    slspPath: "/api/v1/finance/statutory/slsp/sales",
    slspFilename: "slsp-sales",
    vatColumn: "output_vat" as const,
    vatLabel: "Output VAT",
  },
  purchases: {
    title: "VAT purchases register",
    apiPath: "/api/v1/finance/statutory/vat/purchases-register",
    slspPath: "/api/v1/finance/statutory/slsp/purchases",
    slspFilename: "slsp-purchases",
    vatColumn: "input_vat" as const,
    vatLabel: "Input VAT",
  },
};

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function VatRegisterPage(props: Props) {
  const toast = useToast();
  const cfg = config[props.mode];
  const [periodFrom, setPeriodFrom] = createSignal(monthStartISO());
  const [periodTo, setPeriodTo] = createSignal(new Date().toISOString().slice(0, 10));
  const [runKey, setRunKey] = createSignal(0);

  const register = createQuery(() => ({
    queryKey: ["vat-register", props.mode, periodFrom(), periodTo(), runKey()],
    enabled: runKey() > 0,
    queryFn: async () => {
      const qs = new URLSearchParams({ period_from: periodFrom(), period_to: periodTo() });
      const res = await apiFetch<RegisterPayload>(`${cfg.apiPath}?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load register");
      return res.data!;
    },
  }));

  const load = () => {
    if (!periodFrom() || !periodTo()) {
      toast.warning("Period from and to are required.");
      return;
    }
    setRunKey((k) => k + 1);
  };

  const downloadSlsp = async () => {
    const qs = new URLSearchParams({ period_from: periodFrom(), period_to: periodTo() });
    const result = await downloadApiFile(`${cfg.slspPath}?${qs}`, `${cfg.slspFilename}_${periodFrom()}_${periodTo()}.csv`);
    if (!result.ok) toast.warning(result.error ?? "Download failed.");
  };

  const totals = () => {
    const rows = register.data?.rows ?? [];
    return rows.reduce(
      (acc, row) => ({
        vatable: acc.vatable + row.vatable_amount,
        exempt: acc.exempt + row.exempt_amount,
        zeroRated: acc.zeroRated + row.zero_rated_amount,
        vat: acc.vat + (props.mode === "sales" ? row.output_vat : row.input_vat),
      }),
      { vatable: 0, exempt: 0, zeroRated: 0, vat: 0 },
    );
  };

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>{cfg.title}</span>
      </div>
      <Show when={register.data && !register.data!.vat_enabled}>
        <section class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This tenant is registered as <strong>non-VAT</strong>. VAT registers are shown for reference only.{" "}
          <A href="/app/finance/statutory/percentage-tax" class="font-medium text-brand-700 hover:underline">
            Percentage tax workpaper
          </A>
        </section>
      </Show>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">{cfg.title}</h2>
        <p class="mt-1 text-sm text-text-secondary">
          {register.data?.disclaimer ?? "For accountant review — not a BIR e-filing submission."}
        </p>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Period from">
            <input class={inputClass} type="date" value={periodFrom()} onInput={(e) => setPeriodFrom(e.currentTarget.value)} />
          </Field>
          <Field label="Period to">
            <input class={inputClass} type="date" value={periodTo()} onInput={(e) => setPeriodTo(e.currentTarget.value)} />
          </Field>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={load}>
            Load register
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium" onClick={() => void downloadSlsp()}>
            Download SLSP CSV
          </button>
        </div>
      </section>
      <Show when={register.isFetching}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={register.data}>
        {(data) => (
          <div class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-left">
                <tr>
                  <th class="px-3 py-2">Date</th>
                  <th class="px-3 py-2">Type</th>
                  <th class="px-3 py-2">Doc no.</th>
                  <th class="px-3 py-2">Partner TIN</th>
                  <th class="px-3 py-2">Partner name</th>
                  <th class="px-3 py-2 text-right">Vatable</th>
                  <th class="px-3 py-2 text-right">Exempt</th>
                  <th class="px-3 py-2 text-right">Zero-rated</th>
                  <th class="px-3 py-2 text-right">{cfg.vatLabel}</th>
                </tr>
              </thead>
              <tbody>
                <For each={data().rows}>
                  {(row) => (
                    <tr class="border-b border-stroke/60">
                      <td class="px-3 py-2">{row.doc_date}</td>
                      <td class="px-3 py-2">{row.doc_type.replace(/_/g, " ")}</td>
                      <td class="px-3 py-2">{row.doc_no}</td>
                      <td class="px-3 py-2">{row.partner_tin || "—"}</td>
                      <td class="px-3 py-2">{row.partner_name}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.vatable_amount)}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.exempt_amount)}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.zero_rated_amount)}</td>
                      <td class="px-3 py-2 text-right">
                        {formatMoney(props.mode === "sales" ? row.output_vat : row.input_vat)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot class="border-t border-stroke bg-slate-50 font-semibold">
                <tr>
                  <td class="px-3 py-2 text-right" colspan="5">
                    Total
                  </td>
                  <td class="px-3 py-2 text-right">{formatMoney(totals().vatable)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(totals().exempt)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(totals().zeroRated)}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(totals().vat)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Show>
    </div>
  );
}

export function VatSalesRegisterPage() {
  return <VatRegisterPage mode="sales" />;
}

export function VatPurchasesRegisterPage() {
  return <VatRegisterPage mode="purchases" />;
}
