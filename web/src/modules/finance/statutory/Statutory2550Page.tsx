import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { formatMoney } from "../../../shared/money";
import { useToast } from "../../../shared/toast";

type TaxpayerProfile = {
  tax_regime?: string | null;
};

type Adjustments = {
  adj_output_vat: number;
  adj_input_vat: number;
  adj_vatable_sales: number;
  adj_exempt_sales: number;
  adj_zero_rated_sales: number;
  adj_vatable_purchases: number;
  adj_exempt_purchases: number;
  adj_zero_rated_purchases: number;
  adj_other: number;
  audit_note: string;
  updated_at?: string;
};

type Workpaper = {
  period_from: string;
  period_to: string;
  return_type: string;
  tax_regime: string;
  vat_enabled: boolean;
  total_vatable_sales: number;
  total_exempt_sales: number;
  total_zero_rated_sales: number;
  total_output_vat: number;
  total_vatable_purchases: number;
  total_exempt_purchases: number;
  total_zero_rated_purchases: number;
  total_input_vat: number;
  journal_output_vat: number;
  journal_input_vat: number;
  net_vat_payable: number;
  adjusted_net_vat_payable: number;
  adjustments: Adjustments;
  disclaimer: string;
};

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function quarterStartISO() {
  const d = new Date();
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qMonth, 1).toISOString().slice(0, 10);
}

export default function Statutory2550Page() {
  const toast = useToast();
  const client = useQueryClient();
  const [returnType, setReturnType] = createSignal<"2550M" | "2550Q">("2550M");
  const [periodFrom, setPeriodFrom] = createSignal(monthStartISO());
  const [periodTo, setPeriodTo] = createSignal(new Date().toISOString().slice(0, 10));
  const [runKey, setRunKey] = createSignal(0);
  const [saving, setSaving] = createSignal(false);

  const [adjOutputVat, setAdjOutputVat] = createSignal("0");
  const [adjInputVat, setAdjInputVat] = createSignal("0");
  const [adjVatableSales, setAdjVatableSales] = createSignal("0");
  const [adjExemptSales, setAdjExemptSales] = createSignal("0");
  const [adjZeroRatedSales, setAdjZeroRatedSales] = createSignal("0");
  const [adjVatablePurchases, setAdjVatablePurchases] = createSignal("0");
  const [adjExemptPurchases, setAdjExemptPurchases] = createSignal("0");
  const [adjZeroRatedPurchases, setAdjZeroRatedPurchases] = createSignal("0");
  const [adjOther, setAdjOther] = createSignal("0");
  const [auditNote, setAuditNote] = createSignal("");

  const profile = createQuery(() => ({
    queryKey: ["statutory-taxpayer-profile"],
    queryFn: async () => {
      const res = await apiFetch<TaxpayerProfile>("/api/v1/finance/statutory/taxpayer-profile");
      if (!res.success) throw new Error(res.message ?? "Failed to load profile");
      return res.data!;
    },
  }));

  const isNonVat = () => (profile.data?.tax_regime ?? "").toLowerCase() === "non_vat";

  const applyAdjustmentsFromWorkpaper = (wp: Workpaper) => {
    const a = wp.adjustments;
    setAdjOutputVat(String(a.adj_output_vat));
    setAdjInputVat(String(a.adj_input_vat));
    setAdjVatableSales(String(a.adj_vatable_sales));
    setAdjExemptSales(String(a.adj_exempt_sales));
    setAdjZeroRatedSales(String(a.adj_zero_rated_sales));
    setAdjVatablePurchases(String(a.adj_vatable_purchases));
    setAdjExemptPurchases(String(a.adj_exempt_purchases));
    setAdjZeroRatedPurchases(String(a.adj_zero_rated_purchases));
    setAdjOther(String(a.adj_other));
    setAuditNote(a.audit_note ?? "");
  };

  const workpaper = createQuery(() => ({
    queryKey: ["statutory-2550", returnType(), periodFrom(), periodTo(), runKey()],
    enabled: runKey() > 0,
    queryFn: async () => {
      const qs = new URLSearchParams({
        period_from: periodFrom(),
        period_to: periodTo(),
        return_type: returnType(),
      });
      const res = await apiFetch<Workpaper>(`/api/v1/finance/statutory/2550?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load workpaper");
      const wp = res.data!;
      applyAdjustmentsFromWorkpaper(wp);
      return wp;
    },
  }));

  const onReturnTypeChange = (rt: "2550M" | "2550Q") => {
    setReturnType(rt);
    if (rt === "2550Q") {
      setPeriodFrom(quarterStartISO());
    } else {
      setPeriodFrom(monthStartISO());
    }
  };

  const load = () => {
    if (!periodFrom() || !periodTo()) {
      toast.warning("Period from and to are required.");
      return;
    }
    setRunKey((k) => k + 1);
  };

  const parseNum = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const saveAdjustments = async () => {
    setSaving(true);
    const res = await apiFetch<Adjustments>("/api/v1/finance/statutory/2550/adjustments", {
      method: "PUT",
      body: JSON.stringify({
        period_from: periodFrom(),
        period_to: periodTo(),
        return_type: returnType(),
        adj_output_vat: parseNum(adjOutputVat()),
        adj_input_vat: parseNum(adjInputVat()),
        adj_vatable_sales: parseNum(adjVatableSales()),
        adj_exempt_sales: parseNum(adjExemptSales()),
        adj_zero_rated_sales: parseNum(adjZeroRatedSales()),
        adj_vatable_purchases: parseNum(adjVatablePurchases()),
        adj_exempt_purchases: parseNum(adjExemptPurchases()),
        adj_zero_rated_purchases: parseNum(adjZeroRatedPurchases()),
        adj_other: parseNum(adjOther()),
        audit_note: auditNote(),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save adjustments.");
      return;
    }
    toast.success("CPA adjustments saved.");
    void client.invalidateQueries({ queryKey: ["statutory-2550"] });
    setRunKey((k) => k + 1);
  };

  return (
    <div class="space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>2550M / 2550Q workpaper</span>
      </div>

      <Show when={isNonVat()}>
        <section class="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-amber-950">Non-VAT taxpayer</h2>
          <p class="mt-2 text-sm text-amber-900">
            Your taxpayer profile is set to <strong>non-VAT</strong>. Form 2550M/Q does not apply. Update your profile under{" "}
            <A href="/app/finance/statutory/taxpayer-profile" class="font-medium text-brand-700 hover:underline">
              Taxpayer profile
            </A>{" "}
            if you are VAT-registered, or use the{" "}
            <A href="/app/finance/statutory/percentage-tax" class="font-medium text-brand-700 hover:underline">
              percentage tax workpaper
            </A>{" "}
            for non-VAT filing prep.
          </p>
        </section>
      </Show>

      <Show when={!isNonVat()}>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h2 class="text-lg font-semibold text-text-primary">2550M / 2550Q VAT workpaper</h2>
          <p class="mt-1 text-sm text-text-secondary">
            {workpaper.data?.disclaimer ?? "For accountant review — not a BIR e-filing submission."}
          </p>
          <div class="mt-4 flex flex-wrap items-end gap-3">
            <Field label="Return type">
              <select
                class={inputClass}
                value={returnType()}
                onChange={(e) => onReturnTypeChange(e.currentTarget.value as "2550M" | "2550Q")}
              >
                <option value="2550M">2550M (monthly)</option>
                <option value="2550Q">2550Q (quarterly)</option>
              </select>
            </Field>
            <Field label="Period from">
              <input class={inputClass} type="date" value={periodFrom()} onInput={(e) => setPeriodFrom(e.currentTarget.value)} />
            </Field>
            <Field label="Period to">
              <input class={inputClass} type="date" value={periodTo()} onInput={(e) => setPeriodTo(e.currentTarget.value)} />
            </Field>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={load}>
              Load workpaper
            </button>
          </div>
        </section>

        <Show when={workpaper.isFetching}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>

        <Show when={workpaper.data}>
          {(data) => (
            <>
              <div class="grid gap-4 md:grid-cols-2">
                <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h3 class="font-semibold text-text-primary">Sales (output VAT)</h3>
                  <dl class="mt-3 space-y-2 text-sm">
                    <div class="flex justify-between">
                      <dt>Vatable sales</dt>
                      <dd>{formatMoney(data().total_vatable_sales)}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt>Exempt sales</dt>
                      <dd>{formatMoney(data().total_exempt_sales)}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt>Zero-rated sales</dt>
                      <dd>{formatMoney(data().total_zero_rated_sales)}</dd>
                    </div>
                    <div class="flex justify-between border-t border-stroke pt-2 font-semibold">
                      <dt>Output VAT (register)</dt>
                      <dd>{formatMoney(data().total_output_vat)}</dd>
                    </div>
                    <div class="flex justify-between text-text-secondary">
                      <dt>Output VAT (GL journal)</dt>
                      <dd>{formatMoney(data().journal_output_vat)}</dd>
                    </div>
                  </dl>
                </section>
                <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h3 class="font-semibold text-text-primary">Purchases (input VAT)</h3>
                  <dl class="mt-3 space-y-2 text-sm">
                    <div class="flex justify-between">
                      <dt>Vatable purchases</dt>
                      <dd>{formatMoney(data().total_vatable_purchases)}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt>Exempt purchases</dt>
                      <dd>{formatMoney(data().total_exempt_purchases)}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt>Zero-rated purchases</dt>
                      <dd>{formatMoney(data().total_zero_rated_purchases)}</dd>
                    </div>
                    <div class="flex justify-between border-t border-stroke pt-2 font-semibold">
                      <dt>Input VAT (register)</dt>
                      <dd>{formatMoney(data().total_input_vat)}</dd>
                    </div>
                    <div class="flex justify-between text-text-secondary">
                      <dt>Input VAT (GL journal)</dt>
                      <dd>{formatMoney(data().journal_input_vat)}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h3 class="font-semibold text-text-primary">Net VAT payable</h3>
                  <div class="text-right">
                    <p class="text-sm text-text-secondary">System: {formatMoney(data().net_vat_payable)}</p>
                    <p class="text-lg font-semibold text-brand-800">Adjusted: {formatMoney(data().adjusted_net_vat_payable)}</p>
                  </div>
                </div>
              </section>

              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h3 class="font-semibold text-text-primary">CPA manual adjustments</h3>
                <p class="mt-1 text-sm text-text-secondary">Enter corrections for your accountant before filing prep. Saved per period and return type.</p>
                <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Adj. output VAT">
                    <input class={inputClass} type="number" step="0.01" value={adjOutputVat()} onInput={(e) => setAdjOutputVat(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. input VAT">
                    <input class={inputClass} type="number" step="0.01" value={adjInputVat()} onInput={(e) => setAdjInputVat(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. vatable sales">
                    <input class={inputClass} type="number" step="0.01" value={adjVatableSales()} onInput={(e) => setAdjVatableSales(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. exempt sales">
                    <input class={inputClass} type="number" step="0.01" value={adjExemptSales()} onInput={(e) => setAdjExemptSales(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. zero-rated sales">
                    <input class={inputClass} type="number" step="0.01" value={adjZeroRatedSales()} onInput={(e) => setAdjZeroRatedSales(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. vatable purchases">
                    <input class={inputClass} type="number" step="0.01" value={adjVatablePurchases()} onInput={(e) => setAdjVatablePurchases(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. exempt purchases">
                    <input class={inputClass} type="number" step="0.01" value={adjExemptPurchases()} onInput={(e) => setAdjExemptPurchases(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. zero-rated purchases">
                    <input class={inputClass} type="number" step="0.01" value={adjZeroRatedPurchases()} onInput={(e) => setAdjZeroRatedPurchases(e.currentTarget.value)} />
                  </Field>
                  <Field label="Adj. other">
                    <input class={inputClass} type="number" step="0.01" value={adjOther()} onInput={(e) => setAdjOther(e.currentTarget.value)} />
                  </Field>
                </div>
                <div class="mt-3">
                  <Field label="Audit note">
                    <textarea
                      class={`${inputClass} min-h-[80px]`}
                      value={auditNote()}
                      onInput={(e) => setAuditNote(e.currentTarget.value)}
                      placeholder="Document assumptions, reconciling items, or CPA sign-off notes."
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={saving()}
                  onClick={() => void saveAdjustments()}
                >
                  {saving() ? "Saving…" : "Save adjustments"}
                </button>
              </section>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
}
