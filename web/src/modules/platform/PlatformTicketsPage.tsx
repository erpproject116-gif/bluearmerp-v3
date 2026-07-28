import { For, Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { downloadReportCsv } from "../../shared/reports/downloadReportCsv";
import { usePlatformTickets } from "../../shared/usePlatform";

const STATUS_OPTIONS = [
  { value: "", label: "Open queue" },
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function PlatformTicketsPage() {
  const [q, setQ] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [page, setPage] = createSignal(1);
  const pageSize = 50;
  const tickets = usePlatformTickets({
    q: () => q(),
    status: () => status(),
    page: () => page(),
    pageSize: () => pageSize,
  });

  const totalPages = () => {
    const total = tickets.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  };

  const exportUrl = (format: "csv" | "md") => {
    const qs = new URLSearchParams({ format, status: status() || "all" });
    if (q().trim()) qs.set("q", q().trim());
    return `/api/v1/platform/console/tickets/export?${qs}`;
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">Support tickets</h2>
          <p class="mt-1 text-sm text-slate-500">
            Same tickets as tenant ERP Support. Default view is the open queue; use All statuses for closed/resolved.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status()}
            onChange={(e) => {
              setStatus(e.currentTarget.value);
              setPage(1);
            }}
          >
            <For each={STATUS_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
          <input
            class="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search ticket no, subject, partner…"
            value={q()}
            onInput={(e) => {
              setQ(e.currentTarget.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => void downloadReportCsv(exportUrl("csv"), "platform-tickets.csv")}
            title="Export titles and full body as CSV"
          >
            Export CSV
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => void downloadReportCsv(exportUrl("md"), "platform-tickets.md")}
            title="Export all tickets with title and full body for documentation"
          >
            Export docs (MD)
          </button>
        </div>
      </div>
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2">Ticket no</th>
              <th class="px-3 py-2">Subject</th>
              <th class="px-3 py-2">Tenant</th>
              <th class="px-3 py-2">Partner</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Priority</th>
              <th class="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            <Show when={tickets.isLoading}>
              <tr><td class="px-3 py-4 text-slate-500" colspan="8">Loading…</td></tr>
            </Show>
            <Show when={!tickets.isLoading && (tickets.data?.tickets.length ?? 0) === 0}>
              <tr><td class="px-3 py-4 text-slate-500" colspan="8">No tickets match this filter.</td></tr>
            </Show>
            <For each={tickets.data?.tickets ?? []}>
              {(t) => (
                <tr class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2">
                    <A href={`/app/platform-command/tickets/${t.id}`} class="font-medium text-slate-900 hover:underline">
                      {t.ticket_no}
                    </A>
                  </td>
                  <td class="px-3 py-2 text-slate-700">{t.subject}</td>
                  <td class="px-3 py-2">
                    <span class="font-medium text-slate-800">{t.company_code}</span>
                    <Show when={t.tenant_name}>
                      <p class="text-xs text-slate-500">{t.tenant_name}</p>
                    </Show>
                  </td>
                  <td class="px-3 py-2 text-slate-600">{t.partner_name || "—"}</td>
                  <td class="px-3 py-2">
                    <Show when={t.customer_id} fallback={<span class="text-slate-400">—</span>}>
                      <A href={`/app/platform-command/customers/${t.customer_id}`} class="hover:underline">
                        {t.customer_name || "Customer"}
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
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p>
          Page {tickets.data?.page ?? page()} of {totalPages()} · {tickets.data?.total ?? 0} ticket(s)
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            disabled={page() <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
            disabled={page() >= totalPages()}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
