import { createMemo, createSignal, For, Show } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { useOperationsWorkItems, useOperationsWorkspaces } from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";

function weekLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OperationsCalendarPage() {
  const [workspaceId, setWorkspaceId] = createSignal<number | null>(null);
  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 50 }));
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
        <p class="text-sm text-text-secondary">Select a workspace to view the calendar.</p>
      }>
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
