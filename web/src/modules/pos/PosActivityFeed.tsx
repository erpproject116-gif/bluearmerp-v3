import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { formatPeso } from "../../shared/money";
import { fetchSessionActivity, type SessionActivityEvent } from "../../shared/usePos";

function money(n: number): string {
  return formatPeso(n);
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "sale":
      return "Sale";
    case "void":
      return "Void";
    case "cash_in":
      return "Cash in";
    case "cash_out":
      return "Cash out";
    case "coin_exchange":
      return "Coin exchange";
    default:
      return kind;
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

/** Session-scoped shift diary feed (polls while open). */
export function PosActivityFeed(props: {
  sessionId: number;
  onClose: () => void;
  pollMs?: number;
}) {
  const [rows, setRows] = createSignal<SessionActivityEvent[]>([]);
  const [loading, setLoading] = createSignal(true);

  const reload = async () => {
    const list = await fetchSessionActivity(props.sessionId);
    setRows(list);
    setLoading(false);
  };

  onMount(() => {
    void reload();
    const ms = props.pollMs ?? 5000;
    const t = window.setInterval(() => void reload(), ms);
    onCleanup(() => window.clearInterval(t));
  });

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        class="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{ "padding-bottom": "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 class="text-lg font-semibold">Shift activity</h3>
            <p class="text-xs text-slate-500">Live feed for this session · updates every few seconds</p>
          </div>
          <button type="button" class="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <Show when={!loading()} fallback={<p class="text-sm text-slate-400">Loading…</p>}>
            <Show when={rows().length > 0} fallback={<p class="py-8 text-center text-sm text-slate-400">No activity yet this shift.</p>}>
              <ul class="space-y-2">
                <For each={rows()}>
                  {(ev) => (
                    <li class="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                      <div class="min-w-0">
                        <p class="font-medium">
                          <span
                            classList={{
                              "text-emerald-700": ev.kind === "sale",
                              "text-red-700": ev.kind === "void",
                              "text-slate-800": ev.kind !== "sale" && ev.kind !== "void",
                            }}
                          >
                            {kindLabel(ev.kind)}
                          </span>
                          <Show when={ev.sales_no}>
                            <span class="ml-2 font-mono text-xs text-slate-500">{ev.sales_no}</span>
                          </Show>
                        </p>
                        <p class="truncate text-xs text-slate-500">
                          {formatWhen(ev.at)}
                          <Show when={ev.label && ev.label !== ev.sales_no}> · {ev.label}</Show>
                          <Show when={ev.tender}> · {ev.tender}</Show>
                        </p>
                      </div>
                      <Show when={(ev.amount ?? 0) > 0}>
                        <span class="shrink-0 tabular-nums font-semibold">{money(ev.amount ?? 0)}</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
