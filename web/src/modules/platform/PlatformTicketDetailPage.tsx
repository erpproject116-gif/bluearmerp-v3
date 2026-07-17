import { For, Show, createSignal } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { usePlatformTicket } from "../../shared/usePlatform";

export default function PlatformTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const ticket = usePlatformTicket(() => Number(params.id));
  const [note, setNote] = createSignal("");
  const [saving, setSaving] = createSignal(false);

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
            </div>

            <section class="rounded-xl border border-slate-200 bg-white p-5">
              <h3 class="mb-3 text-sm font-semibold">Internal notes</h3>
              <textarea
                class="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                    <li class="rounded-lg bg-slate-50 px-3 py-2 text-sm">
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
