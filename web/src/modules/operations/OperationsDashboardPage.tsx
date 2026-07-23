import { createMemo, For, Show } from "solid-js";
import {
  useOperationsDashboards,
  useOperationsWidgetData,
} from "../../shared/useOperations";
import { formatMoney } from "../../shared/money";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";
import { uiLabel } from "../../shared/branding/uiLabel";

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

export default function OperationsDashboardPage() {
  const { workspaceId } = useOperationsWorkspace();
  const dashboards = useOperationsDashboards(workspaceId);
  const activeDashboardId = createMemo(() => dashboards.data?.find((d) => d.is_default)?.id ?? dashboards.data?.[0]?.id ?? null);
  const widgetData = useOperationsWidgetData(activeDashboardId);

  return (
    <OperationsLayout>
      <OperationsWorkspaceSelector class="mb-4" />

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view dashboards.</p>
      }>
        <Show when={dashboards.isError || widgetData.isError}>
          <p class="mb-3 text-sm text-red-600">
            {((dashboards.error ?? widgetData.error) as Error)?.message ?? "Failed to load dashboard."}
          </p>
        </Show>
        <Show when={(dashboards.isFetching || widgetData.isFetching) && !widgetData.data}>
          <p class="text-sm text-text-secondary">{uiLabel("operations.loading_widgets")}</p>
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
                            <p class="font-medium">{formatMoney(data.total_budget ?? 0)}</p>
                          </div>
                          <div>
                            <p class="text-xs text-text-secondary">Actual</p>
                            <p class="font-medium">{formatMoney(data.total_actual ?? 0)}</p>
                          </div>
                          <div>
                            <p class="text-xs text-text-secondary">Variance</p>
                            <p class="font-medium">{formatMoney(data.variance ?? 0)}</p>
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
        <Show when={!widgetData.isFetching && widgetData.data && widgetData.data.length === 0}>
          <p class="text-sm text-text-secondary">{uiLabel("operations.no_widgets")}</p>
        </Show>
      </Show>
    </OperationsLayout>
  );
}
