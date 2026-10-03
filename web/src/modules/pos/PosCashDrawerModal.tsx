import { For, Show, createSignal, onMount } from "solid-js";
import { formatPeso, bindDecimalInput, parseDecimalInput } from "../../shared/money";
import {
  addCashMovement,
  fetchCashMovements,
  type CashMovement,
} from "../../shared/usePos";

function money(n: number): string {
  return formatPeso(n);
}

type Mode = "in" | "out" | "coin_exchange";

const MODE_LABEL: Record<Mode, string> = {
  in: "Cash in",
  out: "Cash out",
  coin_exchange: "Coin exchange",
};

/** Cash drawer: in/out affect expected cash; coin exchange is audited only. No revenue JE. */
export function PosCashDrawerModal(props: {
  sessionId: number;
  onClose: () => void;
  onRecorded?: () => void;
  formatError: (res: { message?: string; code?: string; errors?: Record<string, string> }) => string;
}) {
  const [mode, setMode] = createSignal<Mode>("in");
  const [amount, setAmount] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [rows, setRows] = createSignal<CashMovement[]>([]);
  const [err, setErr] = createSignal("");

  const reload = async () => {
    setRows(await fetchCashMovements(props.sessionId));
  };

  onMount(() => {
    void reload();
  });

  const save = async () => {
    setErr("");
    const n = parseDecimalInput(amount());
    if (n === null || n <= 0) {
      setErr("Enter an amount greater than zero.");
      return;
    }
    if (mode() === "coin_exchange" && !reason().trim()) {
      setErr("Add a short reason for the coin exchange.");
      return;
    }
    setSaving(true);
    try {
      const res = await addCashMovement(props.sessionId, {
        movement_type: mode(),
        amount: n,
        reason: reason().trim(),
      });
      if (!res.success) {
        setErr(props.formatError(res) || res.message || "Could not record.");
        return;
      }
      setAmount("");
      setReason("");
      await reload();
      props.onRecorded?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{ "padding-bottom": "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="border-b border-slate-100 px-5 py-4">
          <h3 class="text-lg font-semibold">Cash drawer</h3>
          <p class="mt-1 text-xs text-slate-500">
            Cash in/out change expected drawer cash. Coin exchange (bill ↔ coin) is logged only — it does not change expected cash and posts no accounting entry.
          </p>
        </div>

        <div class="space-y-3 overflow-auto px-5 py-4">
          <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            <For each={(["in", "out", "coin_exchange"] as Mode[])}>
              {(m) => (
                <button
                  type="button"
                  class={`rounded-lg py-2 text-xs font-semibold transition ${
                    mode() === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                  onClick={() => setMode(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              )}
            </For>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">Amount</label>
            <input
              type="text"
              inputmode="decimal"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-right text-lg font-semibold focus:border-emerald-500 focus:outline-none"
              value={amount()}
              onInput={(e) => bindDecimalInput(e.currentTarget, setAmount)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-500">
              Reason{mode() === "coin_exchange" ? " (required)" : " (optional)"}
            </label>
            <input
              type="text"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              value={reason()}
              onInput={(e) => setReason(e.currentTarget.value)}
              placeholder={mode() === "coin_exchange" ? "e.g. Change ₱500 bill for coins" : "Optional note"}
            />
          </div>

          <Show when={err()}>
            <p class="text-sm text-amber-700">{err()}</p>
          </Show>

          <button
            type="button"
            class="min-h-12 w-full rounded-xl bg-slate-900 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={saving()}
            onClick={() => void save()}
          >
            {saving() ? "Saving…" : `Record ${MODE_LABEL[mode()]}`}
          </button>

          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">This shift</p>
            <Show when={rows().length > 0} fallback={<p class="text-sm text-slate-400">No drawer movements yet.</p>}>
              <ul class="max-h-48 space-y-2 overflow-auto">
                <For each={rows()}>
                  {(m) => (
                    <li class="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <div class="min-w-0">
                        <p class="font-medium capitalize">
                          {m.movement_type === "coin_exchange" ? "Coin exchange" : `Cash ${m.movement_type}`}
                        </p>
                        <Show when={m.reason}>
                          <p class="truncate text-xs text-slate-500">{m.reason}</p>
                        </Show>
                      </div>
                      <span class="shrink-0 tabular-nums font-semibold">{money(m.amount)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </div>

        <div class="border-t border-slate-100 p-4">
          <button
            type="button"
            class="min-h-11 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium"
            onClick={props.onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
