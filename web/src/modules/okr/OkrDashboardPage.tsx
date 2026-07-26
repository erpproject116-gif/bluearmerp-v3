import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useOkrDashboard } from "../../shared/useOkr";

export default function OkrDashboardPage() {
  const dash = useOkrDashboard();
  const s = () => dash.data;

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">OKR dashboard</h1>
          <p class="text-sm text-text-secondary">
            Progress = average of key-result current/target (capped at 100%). At risk = under 40% with under 30 days left.
          </p>
        </div>
        <A href="/app/okr" class="text-sm font-medium text-brand-600 hover:underline">
          Objectives
        </A>
      </div>

      <Show when={dash.isError}>
        <p class="mb-3 text-sm text-red-600">{(dash.error as Error)?.message}</p>
      </Show>

      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Active objectives" value={String(s()?.active_count ?? 0)} />
        <Tile label="Avg progress" value={`${Math.round(s()?.avg_progress ?? 0)}%`} />
        <Tile label="At risk" value={String(s()?.at_risk_count ?? 0)} accent />
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold">By owner</h2>
          <For each={s()?.by_owner ?? []}>
            {(row) => (
              <p class="mb-1 text-sm">
                {row.owner_name}: <span class="font-medium">{Math.round(row.progress)}%</span>
                <span class="text-text-secondary"> ({row.count})</span>
              </p>
            )}
          </For>
          <Show when={(s()?.by_owner.length ?? 0) === 0}>
            <p class="text-sm text-text-secondary">No active OKRs.</p>
          </Show>
        </section>
        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold">Active list</h2>
          <For each={s()?.objectives ?? []}>
            {(row) => (
              <div class="mb-2 flex items-center justify-between text-sm">
                <span>
                  {row.title}
                  <Show when={row.at_risk}>
                    <span class="ml-2 text-xs text-red-700">At risk</span>
                  </Show>
                </span>
                <span class="font-medium">{Math.round(row.progress)}%</span>
              </div>
            )}
          </For>
        </section>
      </div>
    </div>
  );
}

function Tile(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div class="rounded-xl border border-stroke bg-white p-4">
      <p class="text-xs text-text-secondary">{props.label}</p>
      <p class={`mt-1 text-2xl font-semibold ${props.accent ? "text-red-700" : "text-text-primary"}`}>
        {props.value}
      </p>
    </div>
  );
}
