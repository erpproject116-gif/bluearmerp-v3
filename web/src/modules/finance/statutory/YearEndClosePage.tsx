import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";

type FiscalYear = { id: number; year_code: string; year_name: string; is_closed: boolean };

export default function YearEndClosePage() {
  const toast = useToast();
  const client = useQueryClient();
  const [fiscalYearId, setFiscalYearId] = createSignal<number | null>(null);
  const [reAccount, setReAccount] = createSignal("3090");
  const [lockPeriods, setLockPeriods] = createSignal(true);
  const [running, setRunning] = createSignal(false);

  const years = createQuery(() => ({
    queryKey: ["fiscal-years-close"],
    queryFn: async () => {
      const res = await apiFetch<FiscalYear[]>("/api/v1/finance/fiscal-years?pageSize=20");
      if (!res.success) throw new Error(res.message ?? "Failed to load fiscal years");
      return res.data ?? [];
    },
  }));

  const runClose = async () => {
    const id = fiscalYearId();
    if (!id) {
      toast.warning("Select a fiscal year.");
      return;
    }
    setRunning(true);
    const res = await apiFetch("/api/v1/finance/year-end-close", {
      method: "POST",
      body: JSON.stringify({
        fiscal_year_id: id,
        retained_earnings_account_code: reAccount().trim() || "3090",
        lock_periods: lockPeriods(),
      }),
    });
    setRunning(false);
    if (!res.success) {
      toast.warning(res.message ?? "Year-end close failed.");
      return;
    }
    toast.success("Year-end closing entry posted.");
    void client.invalidateQueries({ queryKey: ["fiscal-years-close"] });
  };

  return (
    <div class="mx-auto max-w-xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Year-end close</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">Year-end closing entry</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Creates a posted journal entry closing income and expense accounts to retained earnings (default 3090), then optionally locks fiscal periods.
        </p>
        <Show when={!years.isLoading} fallback={<p class="mt-4 text-sm text-text-secondary">Loading…</p>}>
          <div class="mt-4 space-y-3">
            <Field label="Fiscal year">
              <select
                class={inputClass}
                value={fiscalYearId() ?? ""}
                onChange={(e) => setFiscalYearId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
              >
                <option value="">Select…</option>
                <For each={years.data ?? []}>
                  {(y) => (
                    <option value={y.id} disabled={y.is_closed}>
                      {y.year_code} — {y.year_name}
                      {y.is_closed ? " (closed)" : ""}
                    </option>
                  )}
                </For>
              </select>
            </Field>
            <Field label="Retained earnings account code">
              <input class={inputClass} value={reAccount()} onInput={(e) => setReAccount(e.currentTarget.value)} />
            </Field>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lockPeriods()} onChange={(e) => setLockPeriods(e.currentTarget.checked)} />
              Lock all periods in this fiscal year after closing
            </label>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={running()}
              onClick={() => void runClose()}
            >
              {running() ? "Running…" : "Run year-end close"}
            </button>
          </div>
        </Show>
      </section>
    </div>
  );
}
