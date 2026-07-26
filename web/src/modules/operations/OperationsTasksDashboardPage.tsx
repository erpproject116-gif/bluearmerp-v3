import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useOperationsTasksDashboard } from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";
import { uiLabel } from "../../shared/branding/uiLabel";

export default function OperationsTasksDashboardPage() {
  const { workspaceId } = useOperationsWorkspace();
  const dash = useOperationsTasksDashboard(workspaceId);
  const summary = () => dash.data;

  return (
    <OperationsLayout>
      <OperationsWorkspaceSelector class="mb-4" />

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view the tasks dashboard.</p>
      }>
        <Show when={dash.isError}>
          <p class="mb-3 text-sm text-red-600">{(dash.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <Show when={dash.isFetching && !dash.data}>
          <p class="text-sm text-text-secondary">{uiLabel("operations.loading_widgets")}</p>
        </Show>

        <Show when={summary()}>
          {(s) => (
            <>
              <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="My open" value={s().my_open} href="/app/operations" />
                <Kpi label="My overdue" value={s().my_overdue} href="/app/operations" accent />
                <Kpi label="Workspace overdue" value={s().workspace_overdue} href="/app/operations" accent />
                <Kpi label="Due this week" value={s().due_this_week} href="/app/operations/calendar" />
              </div>

              <div class="mb-4 grid gap-4 md:grid-cols-2">
                <section class="rounded-xl border border-stroke bg-white p-4">
                  <h3 class="mb-3 text-sm font-semibold text-text-primary">By status</h3>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <For each={s().by_status ?? []}>
                      {(row) => (
                        <div>
                          <span class="capitalize text-text-secondary">{row.key.replace("_", " ")}</span>
                          <p class="text-lg font-semibold">{row.count}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
                <section class="rounded-xl border border-stroke bg-white p-4">
                  <h3 class="mb-3 text-sm font-semibold text-text-primary">By priority</h3>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <For each={s().by_priority ?? []}>
                      {(row) => (
                        <div>
                          <span class="capitalize text-text-secondary">{row.key}</span>
                          <p class="text-lg font-semibold">{row.count}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </div>

              <section class="mb-4 rounded-xl border border-stroke bg-white p-4">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 class="text-sm font-semibold text-text-primary">Overdue & due soon</h3>
                  <div class="flex gap-3 text-sm">
                    <A href="/app/operations" class="text-brand-600 hover:underline">Work hub</A>
                    <A href="/app/operations/calendar" class="text-brand-600 hover:underline">Calendar</A>
                    <A href="/app/operations/timeline" class="text-brand-600 hover:underline">Timeline</A>
                  </div>
                </div>
                <Show when={(s().overdue_or_soon ?? []).length === 0}>
                  <p class="text-sm text-text-secondary">No overdue or due-soon work items.</p>
                </Show>
                <Show when={(s().overdue_or_soon ?? []).length > 0}>
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-text-secondary">
                        <th class="py-1 font-medium">Title</th>
                        <th class="py-1 font-medium">Due</th>
                        <th class="py-1 font-medium">Priority</th>
                        <th class="py-1 font-medium">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={s().overdue_or_soon}>
                        {(row) => (
                          <tr class="border-t border-stroke">
                            <td class="py-2">
                              <span class={row.overdue ? "font-medium text-red-700" : ""}>{row.title}</span>
                            </td>
                            <td class="py-2">{row.end_date ?? "—"}</td>
                            <td class="py-2 capitalize">{row.priority}</td>
                            <td class="py-2">{row.assignee_name || "—"}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </section>

              <p class="text-sm text-text-secondary">
                CRM follow-ups (your open):{" "}
                <A href={s().crm_follow_ups_deep_link || "/app/crm/follow-up-tasks"} class="font-medium text-brand-600 hover:underline">
                  {s().crm_follow_ups_open}
                </A>
              </p>
            </>
          )}
        </Show>
      </Show>
    </OperationsLayout>
  );
}

function Kpi(props: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <A
      href={props.href}
      class={`rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md ${
        props.accent ? "ring-1 ring-red-100" : ""
      }`}
    >
      <p class="text-xs text-text-secondary">{props.label}</p>
      <p class={`mt-1 text-2xl font-semibold ${props.accent ? "text-red-700" : "text-text-primary"}`}>
        {props.value}
      </p>
    </A>
  );
}
