import { createMemo, For, Show } from "solid-js";
import { useOperationsWorkItems } from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";

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
  const { workspaceId } = useOperationsWorkspace();
  const items = useOperationsWorkItems(() => ({
    workspace_id: workspaceId() ?? undefined,
    view: "timeline",
  }));

  const timeline = createMemo(() => {
    const rows = items.data?.rows ?? [];
    const datedStarts = rows.map((r) => parseDate(r.start_date)).filter((d): d is number => d != null);
    const datedEnds = rows.map((r) => parseDate(r.end_date)).filter((d): d is number => d != null);
    const min = datedStarts.length ? Math.min(...datedStarts) : Date.now();
    const max = datedEnds.length ? Math.max(...datedEnds) : min + 7 * 86400000;
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
      <OperationsWorkspaceSelector class="mb-4" />

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view the timeline.</p>
      }>
        <div class="rounded-xl border border-stroke bg-white p-4">
          <p class="mb-4 text-xs text-text-secondary">Gantt-style timeline based on start and end dates.</p>
          <Show when={items.isError}>
            <p class="mb-3 text-sm text-red-600">
              {(items.error as Error)?.message ?? "Failed to load work items."}
            </p>
          </Show>
          <Show when={items.isFetching && !items.data}>
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
