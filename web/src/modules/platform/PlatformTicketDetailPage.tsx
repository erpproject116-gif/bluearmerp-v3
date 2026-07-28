import { For, Show, createEffect, createSignal } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { usePlatformTicket } from "../../shared/usePlatform";

const PRODUCT_GAPS = [
  { value: "", label: "— Not a product gap —" },
  { value: "cash_flow", label: "Cash Flow / Fund statements" },
  { value: "cash_book", label: "Cash Book" },
  { value: "ar_ap_aging_details", label: "AR/AP Aging Details" },
  { value: "check_lifecycle", label: "Check received/issued lifecycle" },
  { value: "day_labor", label: "Day laborer payroll" },
  { value: "leave_ess", label: "Leave / clock-in ESS" },
  { value: "serial_scan", label: "Serial scan UX" },
  { value: "pg_card", label: "PG / credit card flows" },
  { value: "other", label: "Other ECOUNT / feature gap" },
];

export default function PlatformTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const ticket = usePlatformTicket(() => Number(params.id));
  const [note, setNote] = createSignal("");
  const [gapTag, setGapTag] = createSignal("");
  const [gapNote, setGapNote] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    const t = ticket.data;
    if (!t) return;
    setGapTag(t.product_gap_tag ?? "");
    setGapNote(t.product_gap_note ?? "");
  });

  const addNote = async () => {
    const body = note().trim();
    if (!body) return;
    setSaving(true);
    const res = await apiFetch(`/api/v1/platform/console/tickets/${params.id}/internal-notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.warning(res.message ?? "Could not save note.");
      return;
    }
    setNote("");
    toast.success("Internal note saved.");
    ticket.refetch();
  };

  const saveGap = async () => {
    setSaving(true);
    const res = await apiFetch(`/api/v1/platform/console/tickets/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        product_gap_tag: gapTag(),
        product_gap_note: gapNote(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.warning(res.message ?? "Could not save product gap.");
      return;
    }
    toast.success(gapTag() ? "Tagged as product gap — feeds backlog signals." : "Product gap cleared.");
    ticket.refetch();
  };

  return (
    <div class="space-y-4">
      <A href="/app/platform-command/tickets" class="text-sm text-slate-500 hover:underline">← Tickets</A>
      <Show when={ticket.data} fallback={<p class="text-sm text-slate-500">Loading ticket…</p>}>
        {(t) => (
          <>
            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="text-xl font-semibold">{t().ticket_no}</h2>
                  <p class="mt-1 text-slate-700">{t().subject}</p>
                  <p class="mt-2 text-xs text-slate-500">
                    Tenant: <span class="font-medium text-slate-700">{t().company_code}</span>
                    <Show when={t().tenant_name}> — {t().tenant_name}</Show>
                    <Show when={t().partner_name}> · Partner: {t().partner_name}</Show>
                  </p>
                </div>
                <div class="text-right text-sm">
                  <p class="capitalize">{t().status.replace("_", " ")} · {t().priority}</p>
                  <Show when={t().customer_id}>
                    <A href={`/app/platform-command/customers/${t().customer_id}`} class="text-xs text-brand-700 hover:underline">
                      {t().customer_name || "Customer 360"}
                    </A>
                  </Show>
                </div>
              </div>
              <Show when={t().description}>
                <p class="mt-4 whitespace-pre-wrap text-sm text-slate-600">{t().description}</p>
              </Show>
              <Show when={t().product_gap_tag}>
                <p class="mt-3 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900">
                  Product gap: {t().product_gap_tag}
                  <Show when={t().product_gap_note}> — {t().product_gap_note}</Show>
                </p>
              </Show>
            </div>

            <section class="rounded-xl border border-slate-200 bg-white p-5">
              <h3 class="mb-1 text-sm font-semibold">Tenant comments</h3>
              <p class="mb-3 text-xs text-slate-500">Visible in the customer’s ERP Support ticket thread.</p>
              <Show
                when={(t().comments ?? []).length > 0}
                fallback={<p class="text-sm text-slate-400">No tenant comments yet.</p>}
              >
                <ul class="space-y-3">
                  <For each={t().comments ?? []}>
                    {(c) => (
                      <li class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                        <p class="text-xs text-slate-500">
                          {c.author_name || "User"} · {new Date(c.created_at).toLocaleString()}
                        </p>
                        <p class="mt-1 whitespace-pre-wrap text-slate-800">{c.body}</p>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="rounded-xl border border-slate-200 bg-white p-5">
              <h3 class="mb-1 text-sm font-semibold">Product gap tag</h3>
              <p class="mb-3 text-xs text-slate-500">
                Mark when this ticket is really a missing feature (ECOUNT parity, Phase B/C). It surfaces on the Command overview.
              </p>
              <div class="flex flex-wrap gap-2">
                <select
                  class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={gapTag()}
                  onChange={(e) => setGapTag(e.currentTarget.value)}
                >
                  <For each={PRODUCT_GAPS}>{(g) => <option value={g.value}>{g.label}</option>}</For>
                </select>
                <input
                  class="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional note for backlog"
                  value={gapNote()}
                  onInput={(e) => setGapNote(e.currentTarget.value)}
                />
                <button
                  type="button"
                  class="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                  disabled={saving()}
                  onClick={() => void saveGap()}
                >
                  Save tag
                </button>
              </div>
            </section>

            <section class="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
              <h3 class="mb-1 text-sm font-semibold">Internal notes (platform only)</h3>
              <p class="mb-3 text-xs text-slate-500">Not visible to the tenant in ERP Support.</p>
              <textarea
                class="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                rows={3}
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
                placeholder="Visible only to platform staff…"
              />
              <button
                type="button"
                class="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                disabled={saving() || !note().trim()}
                onClick={() => void addNote()}
              >
                Add note
              </button>
              <ul class="mt-4 space-y-3">
                <For each={t().internal_notes ?? []}>
                  {(n) => (
                    <li class="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                      <p class="text-xs text-slate-500">{n.author_name || n.author_email} · {new Date(n.created_at).toLocaleString()}</p>
                      <p class="mt-1 whitespace-pre-wrap text-slate-800">{n.body}</p>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </>
        )}
      </Show>
    </div>
  );
}
