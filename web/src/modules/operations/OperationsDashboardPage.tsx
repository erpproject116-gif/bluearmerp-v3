import { createMemo, createSignal, For, Show } from "solid-js";
import {
  useOperationsDashboards,
  useOperationsWidgetData,
  useOperationsWorkspaces,
} from "../../shared/useOperations";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { OperationsLayout } from "./OperationsLayout";

type BVAData = {
  project_code?: string;
  project_name?: string;
  total_budget?: number;
  total_actual?: number;
  variance?: number;
  by_category?: { category: string; budget: number; actual: number; variance: number }[];
};

type SummaryData = {
  open?: number;
  in_progress?: number;
  done?: number;
  blocked?: number;
};

function formatMoney(n?: number) {
  return (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OperationsDashboardPage() {
  const [workspaceId, setWorkspaceId] = createSignal<number | null>(null);
  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 50 }));
  const dashboards = useOperationsDashboards(workspaceId);
  const activeDashboardId = createMemo(() => dashboards.data?.find((d) => d.is_default)?.id ?? dashboards.data?.[0]?.id ?? null);
  const widgetData = useOperationsWidgetData(activeDashboardId);

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
        <p class="text-sm text-text-secondary">Select a workspace to view dashboards.</p>
      }>
        <Show when={widgetData.isFetching}>
          <p class="text-sm text-text-secondary">Loading widgets…</p>
        </Show>
        <div class="grid gap-4 md:grid-cols-2">
          <For each={widgetData.data ?? []}>
            {(widget) => (
              <section class="rounded-xl border border-stroke bg-white p-4">
                <h3 class="mb-3 text-sm font-semibold text-text-primary">{widget.title}</h3>
                <Show when={widget.widget_type === "job_cost_bva"}>
                  {(() => {
                    const data = widget.data as BVAData;
                    return (
                      <div class="space-y-2 text-sm">
                        <p class="text-text-secondary">{data.project_name} ({data.project_code})</p>
                        <div class="grid grid-cols-3 gap-2">
                          <div>
                            <p class="text-xs text-text-secondary">Budget</p>
                            <p class="font-medium">{formatMoney(data.total_budget)}</p>
                          </div>
                          <div>
                            <p class="text-xs text-text-secondary">Actual</p>
                            <p class="font-medium">{formatMoney(data.total_actual)}</p>
                          </div>
                          <div>
                            <p class="text-xs text-text-secondary">Variance</p>
                            <p class="font-medium">{formatMoney(data.variance)}</p>
                          </div>
                        </div>
                        <table class="mt-2 w-full text-xs">
                          <thead>
                            <tr class="text-text-secondary">
                              <th class="py-1 text-left">Category</th>
                              <th class="py-1 text-right">Budget</th>
                              <th class="py-1 text-right">Actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={data.by_category ?? []}>
                              {(row) => (
                                <tr>
                                  <td class="py-1 capitalize">{row.category}</td>
                                  <td class="py-1 text-right">{formatMoney(row.budget)}</td>
                                  <td class="py-1 text-right">{formatMoney(row.actual)}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </Show>
                <Show when={widget.widget_type === "work_item_summary"}>
                  {(() => {
                    const data = widget.data as SummaryData;
                    return (
                      <div class="grid grid-cols-2 gap-3 text-sm">
                        <div><span class="text-text-secondary">Open</span><p class="text-xl font-semibold">{data.open ?? 0}</p></div>
                        <div><span class="text-text-secondary">In progress</span><p class="text-xl font-semibold">{data.in_progress ?? 0}</p></div>
                        <div><span class="text-text-secondary">Done</span><p class="text-xl font-semibold">{data.done ?? 0}</p></div>
                        <div><span class="text-text-secondary">Blocked</span><p class="text-xl font-semibold">{data.blocked ?? 0}</p></div>
                      </div>
                    );
                  })()}
                </Show>
              </section>
            )}
          </For>
        </div>
        <Show when={!widgetData.isFetching && (widgetData.data?.length ?? 0) === 0}>
          <p class="text-sm text-text-secondary">No dashboard widgets yet. Create a workspace with the Construction industry pack.</p>
        </Show>
      </Show>
    </OperationsLayout>
  );
}
