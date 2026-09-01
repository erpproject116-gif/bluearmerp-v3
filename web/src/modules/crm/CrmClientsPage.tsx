import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { formatMoney } from "../../shared/money";
import { useCrmClientsHealth } from "../../shared/useCrmClients";
import { CrmLayout } from "./CrmLayout";

export default function CrmClientsPage() {
  const [page, setPage] = createSignal(1);
  const [q, setQ] = createSignal("");
  const list = useCrmClientsHealth(() => ({ page: page(), pageSize: 25, q: q() || undefined }));

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">Clients</h1>
          <p class="text-sm text-text-secondary">Account health across customers and vendors (read-only). Edit master data in Customers & vendors.</p>
        </div>
        <A href="/app/inventory/partners" class="text-sm font-medium text-brand-600 hover:underline">
          Open customers & vendors
        </A>
      </div>

      <div class="mb-3">
        <input
          class="w-full max-w-sm rounded-lg border border-stroke px-3 py-2 text-sm"
          placeholder="Search company…"
          value={q()}
          onInput={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
        />
      </div>

      <Show when={list.isError}>
        <p class="mb-3 text-sm text-red-600">{(list.error as Error)?.message}</p>
      </Show>

      <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-stroke text-left text-text-secondary">
              <th class="px-3 py-2 font-medium">Client</th>
              <th class="px-3 py-2 font-medium">Health</th>
              <th class="px-3 py-2 font-medium text-right">Open AR</th>
              <th class="px-3 py-2 font-medium">Follow-ups</th>
              <th class="px-3 py-2 font-medium">Work items</th>
              <th class="px-3 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data?.rows ?? []}>
              {(row) => (
                <tr class="border-b border-stroke last:border-0 hover:bg-slate-50">
                  <td class="px-3 py-2">
                    <A href={`/app/crm/clients/${row.partner_id}`} class="font-medium text-brand-600 hover:underline">
                      {row.company_name}
                    </A>
                    <p class="text-xs text-text-secondary">{row.partner_code}</p>
                  </td>
                  <td class="px-3 py-2">
                    <span class={`font-semibold ${scoreClass(row.health_score)}`}>{row.health_score}</span>
                    <Show when={row.credit_limit_on_hold}>
                      <span class="ml-2 text-xs text-red-600">On hold</span>
                    </Show>
                  </td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.open_ar_balance)}</td>
                  <td class="px-3 py-2">
                    {row.open_follow_ups}
                    <Show when={row.overdue_follow_ups > 0}>
                      <span class="ml-1 text-xs text-red-600">({row.overdue_follow_ups} overdue)</span>
                    </Show>
                  </td>
                  <td class="px-3 py-2">
                    {row.open_work_items}
                    <Show when={row.overdue_work_items > 0}>
                      <span class="ml-1 text-xs text-red-600">({row.overdue_work_items} overdue)</span>
                    </Show>
                  </td>
                  <td class="px-3 py-2">{row.last_activity_date ?? "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!list.isFetching && (list.data?.rows.length ?? 0) === 0}>
          <p class="p-4 text-sm text-text-secondary">No customer partners found.</p>
        </Show>
      </div>

      <Show when={(list.data?.total ?? 0) > 25}>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 text-sm disabled:opacity-40"
            disabled={page() <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 text-sm disabled:opacity-40"
            disabled={page() * 25 >= (list.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </Show>
    </CrmLayout>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-red-700";
}
