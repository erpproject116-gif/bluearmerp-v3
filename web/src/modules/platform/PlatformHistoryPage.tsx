import { For, Show } from "solid-js";
import { usePlatformAccessLogs } from "../../shared/usePlatform";

export default function PlatformHistoryPage() {
  const logs = usePlatformAccessLogs();
  return (
    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Platform history</h2>
        <p class="mt-1 text-sm text-slate-500">Access and operations performed by Command Center staff.</p>
      </div>
      <LogTable items={logs.data ?? []} loading={logs.isLoading} />
    </div>
  );
}

export function PlatformChangeLogsPage() {
  const logs = usePlatformAccessLogs("change");
  return (
    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Platform change logs</h2>
        <p class="mt-1 text-sm text-slate-500">Mutations made from Command Center (plans, follow-ups, tickets, staff).</p>
      </div>
      <LogTable items={logs.data ?? []} loading={logs.isLoading} />
    </div>
  );
}

function LogTable(props: { items: Array<Record<string, any>>; loading: boolean }) {
  return (
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-3 py-2">When</th>
            <th class="px-3 py-2">Actor</th>
            <th class="px-3 py-2">Kind</th>
            <th class="px-3 py-2">Summary</th>
            <th class="px-3 py-2">Route</th>
          </tr>
        </thead>
        <tbody>
          <Show when={props.loading}>
            <tr><td class="px-3 py-4 text-slate-500" colspan="5">Loading…</td></tr>
          </Show>
          <For each={props.items}>
            {(row) => (
              <tr class="border-t border-slate-100">
                <td class="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(row.created_at).toLocaleString()}</td>
                <td class="px-3 py-2">{row.actor_name || row.actor_email}</td>
                <td class="px-3 py-2 capitalize">{row.event_kind}</td>
                <td class="px-3 py-2">{row.summary}</td>
                <td class="px-3 py-2 font-mono text-xs text-slate-500">{row.route_path}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
