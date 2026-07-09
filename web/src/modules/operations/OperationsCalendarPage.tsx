import { createMemo, For, Show } from "solid-js";
import { useOperationsWorkItems } from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";

function weekLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OperationsCalendarPage() {
  const { workspaceId } = useOperationsWorkspace();
  const items = useOperationsWorkItems(() => ({
    workspace_id: workspaceId() ?? undefined,
    view: "calendar",
  }));

  const grouped = createMemo(() => {
    const map = new Map<string, NonNullable<typeof items.data>["rows"]>();
    for (const item of items.data?.rows ?? []) {
      const key = item.start_date ?? item.end_date ?? "unscheduled";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <OperationsLayout>
      <OperationsWorkspaceSelector class="mb-4" />

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view the calendar.</p>
      }>
        <Show when={items.isError}>
          <p class="mb-3 text-sm text-red-600">
            {(items.error as Error)?.message ?? "Failed to load work items."}
          </p>
        </Show>
        <Show when={items.isFetching && !items.data}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>
        <div class="space-y-4">
          <For each={grouped()}>
            {([dateKey, rows]) => (
              <section class="rounded-xl border border-stroke bg-white">
                <h3 class="border-b border-stroke px-4 py-2 text-sm font-semibold text-text-primary">
                  {dateKey === "unscheduled" ? "Unscheduled" : weekLabel(dateKey)}
                </h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b border-stroke text-left text-text-secondary">
                        <th class="px-4 py-2">Title</th>
                        <th class="px-4 py-2">Column</th>
                        <th class="px-4 py-2">Start</th>
                        <th class="px-4 py-2">End</th>
                        <th class="px-4 py-2">Blocked by</th>
                        <th class="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={rows}>
                        {(row) => (
                          <tr class="border-b border-stroke/60">
                            <td class="px-4 py-2 font-medium">{row.title}</td>
                            <td class="px-4 py-2">{row.column_name}</td>
                            <td class="px-4 py-2">{row.start_date ?? "—"}</td>
                            <td class="px-4 py-2">{row.end_date ?? "—"}</td>
                            <td class="px-4 py-2">{row.blocked_by_title || "—"}</td>
                            <td class="px-4 py-2">{row.status}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </OperationsLayout>
  );
}
