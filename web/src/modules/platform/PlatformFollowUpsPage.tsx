import { For, Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { usePlatformFollowUps } from "../../shared/usePlatform";

export default function PlatformFollowUpsPage() {
  const toast = useToast();
  const followUps = usePlatformFollowUps();
  const [title, setTitle] = createSignal("");
  const [customerId, setCustomerId] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const create = async () => {
    const cid = Number(customerId());
    if (!cid || !title().trim()) {
      toast.warning("Customer id and title are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/platform/console/follow-ups", {
      method: "POST",
      body: JSON.stringify({
        platform_customer_id: cid,
        title: title().trim(),
        task_type: "call",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.warning(res.message ?? "Could not create follow-up.");
      return;
    }
    setTitle("");
    toast.success("Follow-up created.");
    followUps.refetch();
  };

  const markDone = async (id: number) => {
    const res = await apiFetch(`/api/v1/platform/console/follow-ups/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ stage: "done" }),
    });
    if (!res.ok) {
      toast.warning(res.message ?? "Could not update.");
      return;
    }
    followUps.refetch();
  };

  return (
    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Follow-ups</h2>
        <p class="mt-1 text-sm text-slate-500">Calls, demos, training, and check-ins for beta customers.</p>
      </div>

      <div class="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          class="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Customer ID"
          value={customerId()}
          onInput={(e) => setCustomerId(e.currentTarget.value)}
        />
        <input
          class="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Follow-up title"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <button
          type="button"
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          disabled={saving()}
          onClick={() => void create()}
        >
          Create
        </button>
      </div>

      <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <Show when={followUps.isLoading}>
          <li class="px-4 py-4 text-sm text-slate-500">Loading…</li>
        </Show>
        <For each={followUps.data ?? []}>
          {(f) => (
            <li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p class="font-medium">{f.title}</p>
                <p class="text-xs text-slate-500">
                  {f.customer_name} · {f.task_type} · {f.stage}
                  {f.due_at ? ` · due ${new Date(f.due_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div class="flex gap-2">
                <A href={`/app/platform-command/customers/${f.platform_customer_id}`} class="rounded-md border px-2 py-1 text-xs hover:bg-slate-50">
                  Customer
                </A>
                <Show when={f.stage !== "done"}>
                  <button type="button" class="rounded-md border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => void markDone(f.id)}>
                    Mark done
                  </button>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
