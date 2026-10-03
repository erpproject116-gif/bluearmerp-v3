import { For, Show, createSignal, onMount } from "solid-js";
import { formatPeso } from "../../shared/money";
import {
  fetchDailyRollup,
  fetchZReport,
  posTenderLabel,
  type DailyRollup,
  type ZReport,
} from "../../shared/usePos";

function money(n: number): string {
  return formatPeso(n);
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** End-of-shift Z summary + transaction annex; optional daily rollup. Print via browser. */
export function PosShiftReportPanel(props: {
  sessionId: number;
  locationId?: number | null;
  onClose: () => void;
  initialTab?: "z" | "daily";
}) {
  const [tab, setTab] = createSignal<"z" | "daily">(props.initialTab ?? "z");
  const [z, setZ] = createSignal<ZReport | null>(null);
  const [daily, setDaily] = createSignal<DailyRollup | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [err, setErr] = createSignal("");
  const [dailyDate, setDailyDate] = createSignal(new Date().toISOString().slice(0, 10));

  const loadZ = async () => {
    setLoading(true);
    setErr("");
    const rep = await fetchZReport(props.sessionId);
    setZ(rep);
    if (!rep) setErr("Could not load end-of-shift report.");
    setLoading(false);
  };

  const loadDaily = async () => {
    setLoading(true);
    setErr("");
    const d = await fetchDailyRollup(dailyDate(), props.locationId);
    setDaily(d);
    if (!d) setErr("Daily rollup needs POS manage access, or no sessions for that date.");
    setLoading(false);
  };

  onMount(() => {
    void (tab() === "z" ? loadZ() : loadDaily());
  });

  const switchTab = (t: "z" | "daily") => {
    setTab(t);
    void (t === "z" ? loadZ() : loadDaily());
  };

  return (
    <div class="fixed inset-0 z-[70] flex flex-col bg-slate-900/50">
      <div class="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div class="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            class={`rounded-md px-3 py-1.5 text-sm font-medium ${tab() === "z" ? "bg-white shadow-sm" : "text-slate-500"}`}
            onClick={() => switchTab("z")}
          >
            End of shift (Z)
          </button>
          <button
            type="button"
            class={`rounded-md px-3 py-1.5 text-sm font-medium ${tab() === "daily" ? "bg-white shadow-sm" : "text-slate-500"}`}
            onClick={() => switchTab("daily")}
          >
            Daily rollup
          </button>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
            onClick={props.onClose}
          >
            Close
          </button>
          <button
            type="button"
            class="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-4">
        <Show when={err()}>
          <p class="no-print mx-auto mb-3 max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{err()}</p>
        </Show>
        <Show when={!loading()} fallback={<p class="text-center text-sm text-slate-400">Loading report…</p>}>
          <Show when={tab() === "z" && z()}>
            {(rep) => (
              <article class="pos-z-report mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
                <header class="mb-4 border-b border-dashed border-slate-300 pb-3 text-center">
                  <h1 class="text-lg font-bold uppercase tracking-wide">End-of-shift report (Z)</h1>
                  <p class="text-sm font-semibold">{rep().location_name || "POS"}</p>
                  <p class="text-xs text-slate-500">
                    {rep().session_no} · {rep().cashier_name || "Cashier"}
                  </p>
                  <p class="text-xs text-slate-400">
                    Opened {formatWhen(rep().opened_at)}
                    <Show when={rep().closed_at}> · Closed {formatWhen(rep().closed_at)}</Show>
                  </p>
                  <p class="mt-1 text-[10px] text-slate-400">Ops report only — no revenue journal entry on close.</p>
                </header>

                <section class="mb-4 space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-slate-500">Opening cash</span>
                    <span class="tabular-nums">{money(rep().opening_cash)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-500">Sales total</span>
                    <span class="tabular-nums">{money(rep().sales_total)}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-500">Transactions</span>
                    <span class="tabular-nums">
                      {rep().txn_count}
                      <Show when={rep().void_count > 0}> · {rep().void_count} voided</Show>
                    </span>
                  </div>
                  <For each={Object.entries(rep().tenders_by_type ?? {})}>
                    {([type, amount]) => (
                      <div class="flex justify-between">
                        <span class="text-slate-500">{posTenderLabel(type)}</span>
                        <span class="tabular-nums">{money(amount)}</span>
                      </div>
                    )}
                  </For>
                  <Show when={rep().cash_in > 0}>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Cash in</span>
                      <span class="tabular-nums">{money(rep().cash_in)}</span>
                    </div>
                  </Show>
                  <Show when={rep().cash_out > 0}>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Cash out</span>
                      <span class="tabular-nums">-{money(rep().cash_out)}</span>
                    </div>
                  </Show>
                  <Show when={(rep().coin_exchange ?? 0) > 0}>
                    <div class="flex justify-between text-slate-400">
                      <span>Coin exchange (excluded)</span>
                      <span class="tabular-nums">{money(rep().coin_exchange ?? 0)}</span>
                    </div>
                  </Show>
                  <div class="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                    <span>Expected cash</span>
                    <span class="tabular-nums">{money(rep().expected_cash)}</span>
                  </div>
                  <Show when={rep().closing_cash != null}>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Counted at close</span>
                      <span class="tabular-nums">{money(rep().closing_cash ?? 0)}</span>
                    </div>
                    <div class="flex justify-between font-medium">
                      <span>Variance</span>
                      <span class="tabular-nums">{money(rep().variance ?? 0)}</span>
                    </div>
                  </Show>
                </section>

                <section class="mb-2">
                  <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Transaction annex
                  </h2>
                  <Show when={rep().transactions.length > 0} fallback={<p class="text-sm text-slate-400">No sales.</p>}>
                    <table class="w-full text-left text-xs">
                      <thead>
                        <tr class="border-b border-slate-200 text-slate-500">
                          <th class="py-1 font-medium">Sales #</th>
                          <th class="py-1 font-medium">When</th>
                          <th class="py-1 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={rep().transactions}>
                          {(txn) => (
                            <tr class="border-b border-slate-50" classList={{ "text-slate-400 line-through": txn.voided }}>
                              <td class="py-1.5 font-mono">{txn.sales_no}</td>
                              <td class="py-1.5">{formatWhen(txn.at)}</td>
                              <td class="py-1.5 text-right tabular-nums">{money(txn.grand_total)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </Show>
                </section>
              </article>
            )}
          </Show>

          <Show when={tab() === "daily"}>
            <div class="no-print mx-auto mb-3 flex max-w-2xl items-center gap-2">
              <label class="text-sm text-slate-600">Date</label>
              <input
                type="date"
                class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={dailyDate()}
                onInput={(e) => setDailyDate(e.currentTarget.value)}
              />
              <button
                type="button"
                class="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => void loadDaily()}
              >
                Load
              </button>
            </div>
            <Show when={daily()}>
              {(d) => (
                <article class="pos-z-report mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
                  <header class="mb-4 border-b border-dashed border-slate-300 pb-3 text-center">
                    <h1 class="text-lg font-bold uppercase tracking-wide">Daily POS rollup</h1>
                    <p class="text-sm font-semibold">{d().date}</p>
                    <Show when={d().location_name}>
                      <p class="text-xs text-slate-500">{d().location_name}</p>
                    </Show>
                    <p class="mt-1 text-[10px] text-slate-400">Ops reporting only — no extra revenue JE.</p>
                  </header>
                  <section class="mb-4 space-y-1 text-sm">
                    <div class="flex justify-between">
                      <span class="text-slate-500">Sessions</span>
                      <span class="tabular-nums">{d().session_count}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Sales total</span>
                      <span class="tabular-nums font-semibold">{money(d().sales_total)}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Transactions</span>
                      <span class="tabular-nums">
                        {d().txn_count}
                        <Show when={d().void_count > 0}> · {d().void_count} voided</Show>
                      </span>
                    </div>
                    <For each={Object.entries(d().tenders_by_type ?? {})}>
                      {([type, amount]) => (
                        <div class="flex justify-between">
                          <span class="text-slate-500">{posTenderLabel(type)}</span>
                          <span class="tabular-nums">{money(amount)}</span>
                        </div>
                      )}
                    </For>
                  </section>
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 text-slate-500">
                        <th class="py-1 font-medium">Session</th>
                        <th class="py-1 font-medium">Cashier</th>
                        <th class="py-1 text-right font-medium">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={d().sessions}>
                        {(s) => (
                          <tr class="border-b border-slate-50">
                            <td class="py-1.5 font-mono">{s.session_no}</td>
                            <td class="py-1.5">{s.cashier_name}</td>
                            <td class="py-1.5 text-right tabular-nums">{money(s.sales_total)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </article>
              )}
            </Show>
          </Show>
        </Show>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .pos-z-report, .pos-z-report * { visibility: visible !important; }
          .pos-z-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
