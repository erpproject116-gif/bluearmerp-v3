import { createMemo, createSignal, For, Show } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { useOperationsWorkItems, useOperationsWorkspaces } from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";

function parseDate(s?: string | null) {
  if (!s) return null;
  const t = new Date(s + "T00:00:00").getTime();
  return Number.isFinite(t) ? t : null;
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "No dates";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "";
}

export default function OperationsTimelinePage() {
  const [workspaceId, setWorkspaceId] = createSignal<number | null>(null);
  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 50 }));
  const items = useOperationsWorkItems(() => ({
    workspace_id: workspaceId() ?? undefined,
    view: "timeline",
  }));

  const timeline = createMemo(() => {
    const rows = items.data?.rows ?? [];
    const starts = rows.map((r) => parseDate(r.start_date)).filter((d): d is number => d != null);
    const ends = rows.map((r) => parseDate(r.end_date)).filter((d): d is number => d != null);
    const min = starts.length ? Math.min(...starts) : Date.now();
    const max = ends.length ? Math.max(...ends) : min + 7 * 86400000;
    const span = Math.max(max - min, 86400000);
    return rows.map((row) => {
      const s = parseDate(row.start_date) ?? min;
      const e = parseDate(row.end_date) ?? s + 86400000;
      const left = ((s - min) / span) * 100;
      const width = Math.max(((e - s) / span) * 100, 2);
      return { row, left, width };
    });
  });

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label class="text-sm text-text-secondary">Workspace</label>
        <select
          class={inputClass}
          value={workspaceId() ?? ""}
          onChange={(e) => {
            const id = Number(e.currentTarget.value);
            setWorkspaceId(Number.isFinite(id) && id > 0 ? id : null);
          }}
        >
          <option value="">Select workspace…</option>
          <For each={workspaces.data?.rows ?? []}>
            {(ws) => <option value={ws.id}>{ws.workspace_name}</option>}
          </For>
        </select>
      </div>

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view the timeline.</p>
      }>
        <div class="rounded-xl border border-stroke bg-white p-4">
          <p class="mb-4 text-xs text-text-secondary">Gantt-style timeline based on start and end dates.</p>
          <Show when={items.isFetching}>
            <p class="text-sm text-text-secondary">Loading…</p>
          </Show>
          <div class="space-y-3">
            <For each={timeline()}>
              {({ row, left, width }) => (
                <div class="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">
                  <div>
                    <p class="font-medium text-text-primary">{row.title}</p>
                    <p class="text-xs text-text-secondary">{formatRange(row.start_date, row.end_date)}</p>
                    <Show when={row.blocked_by_title}>
                      <p class="text-xs text-amber-700">Blocked: {row.blocked_by_title}</p>
                    </Show>
                  </div>
                  <div class="relative h-8 rounded bg-slate-100">
                    <div
                      class="absolute top-1 h-6 rounded bg-brand-500/80"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={formatRange(row.start_date, row.end_date)}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </OperationsLayout>
  );
}
