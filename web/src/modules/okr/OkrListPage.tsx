import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { useOkrDashboard, useOkrKeyResults, useOkrMutations, useOkrObjectives } from "../../shared/useOkr";

export default function OkrListPage() {
  const [page] = createSignal(1);
  const [title, setTitle] = createSignal("");
  const [start, setStart] = createSignal(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = createSignal(
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  );
  const [selected, setSelected] = createSignal<number | null>(null);
  const [krTitle, setKrTitle] = createSignal("");
  const list = useOkrObjectives(() => ({ page: page(), pageSize: 50, status: "active" }));
  const krs = useOkrKeyResults(selected);
  const mutations = useOkrMutations();

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">OKRs</h1>
          <p class="text-sm text-text-secondary">Objectives and key results (manual progress).</p>
        </div>
        <A href="/app/okr/dashboard" class="text-sm font-medium text-brand-600 hover:underline">
          OKR dashboard
        </A>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <input
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          placeholder="Objective title"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <input
          type="date"
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          value={start()}
          onInput={(e) => setStart(e.currentTarget.value)}
        />
        <input
          type="date"
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          value={end()}
          onInput={(e) => setEnd(e.currentTarget.value)}
        />
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
          disabled={!title().trim() || mutations.createObjective.isPending}
          onClick={async () => {
            const t = title().trim();
            if (!t) return;
            const created = await mutations.createObjective.mutateAsync({
              title: t,
              period_start: start(),
              period_end: end(),
            });
            setTitle("");
            setSelected(created.id);
          }}
        >
          Add objective
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold">Active objectives</h2>
          <ul class="space-y-2">
            <For each={list.data?.rows ?? []}>
              {(row) => (
                <li>
                  <button
                    type="button"
                    class={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selected() === row.id ? "border-brand-600 bg-brand-50" : "border-stroke hover:bg-slate-50"
                    }`}
                    onClick={() => setSelected(row.id)}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-medium">{row.title}</span>
                      <span class={row.at_risk ? "text-red-700" : "text-text-secondary"}>
                        {Math.round(row.progress)}%
                      </span>
                    </div>
                    <p class="text-xs text-text-secondary">
                      {row.period_start} → {row.period_end}
                      {row.at_risk ? " · At risk" : ""}
                    </p>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={(list.data?.rows.length ?? 0) === 0}>
            <p class="text-sm text-text-secondary">No active objectives.</p>
          </Show>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold">Key results</h2>
          <Show when={!selected()} fallback={
            <>
              <div class="mb-3 flex gap-2">
                <input
                  class="flex-1 rounded-lg border border-stroke px-3 py-2 text-sm"
                  placeholder="Key result title"
                  value={krTitle()}
                  onInput={(e) => setKrTitle(e.currentTarget.value)}
                />
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm"
                  disabled={!krTitle().trim() || !selected()}
                  onClick={async () => {
                    const t = krTitle().trim();
                    const oid = selected();
                    if (!t || !oid) return;
                    await mutations.createKeyResult.mutateAsync({ objectiveId: oid, title: t });
                    setKrTitle("");
                  }}
                >
                  Add KR
                </button>
              </div>
              <ul class="space-y-3">
                <For each={krs.data ?? []}>
                  {(kr) => (
                    <li class="rounded-lg border border-stroke p-3 text-sm">
                      <div class="mb-2 flex items-center justify-between">
                        <span class="font-medium">{kr.title}</span>
                        <span>{Math.round(kr.progress)}%</span>
                      </div>
                      <label class="flex items-center gap-2 text-xs text-text-secondary">
                        Current
                        <input
                          type="number"
                          class="w-24 rounded border border-stroke px-2 py-1 text-sm text-text-primary"
                          value={kr.current_value}
                          onChange={(e) => {
                            const v = Number(e.currentTarget.value);
                            if (!Number.isFinite(v)) return;
                            void mutations.patchKeyResult.mutateAsync({ id: kr.id, current_value: v });
                          }}
                        />
                        / {kr.target_value} ({kr.metric_unit})
                      </label>
                    </li>
                  )}
                </For>
              </ul>
            </>
          }>
            <p class="text-sm text-text-secondary">Select an objective to manage key results.</p>
          </Show>
        </section>
      </div>
    </div>
  );
}
