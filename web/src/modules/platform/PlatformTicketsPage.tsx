import { For, Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { usePlatformTickets } from "../../shared/usePlatform";

export default function PlatformTicketsPage() {
  const [q, setQ] = createSignal("");
  const tickets = usePlatformTickets(() => q());

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">Support tickets</h2>
          <p class="mt-1 text-sm text-slate-500">Cross-tenant queue of open and waiting tickets.</p>
        </div>
        <input
          class="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search subject or ticket no…"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
      </div>
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2">Ticket</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Priority</th>
              <th class="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            <Show when={tickets.isLoading}>
              <tr><td class="px-3 py-4 text-slate-500" colspan="5">Loading…</td></tr>
            </Show>
            <For each={tickets.data ?? []}>
              {(t) => (
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2">
                    <A href={`/app/platform-command/tickets/${t.id}`} class="font-medium text-slate-900 hover:underline">
                      {t.ticket_no}
                    </A>
                    <p class="text-xs text-slate-500">{t.subject}</p>
                  </td>
                  <td class="px-3 py-2">
                    <Show when={t.customer_id} fallback={<span class="text-slate-400">{t.company_code}</span>}>
                      <A href={`/app/platform-command/customers/${t.customer_id}`} class="hover:underline">
                        {t.customer_name || t.company_code}
                      </A>
                    </Show>
                  </td>
                  <td class="px-3 py-2 capitalize">{t.status.replace("_", " ")}</td>
                  <td class="px-3 py-2 capitalize">{t.priority}</td>
                  <td class="px-3 py-2 text-slate-500">{t.updated_at ? new Date(t.updated_at).toLocaleString() : "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
