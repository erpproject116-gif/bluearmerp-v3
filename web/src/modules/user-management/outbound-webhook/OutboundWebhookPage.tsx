import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useToast } from "../../../shared/toast";

type EndpointDTO = {
  id: number;
  label: string;
  target_url: string;
  is_active: boolean;
  event_filter: string[];
  has_secret: boolean;
  secret_hint?: string;
  updated_at?: string;
};

type DeliveryDTO = {
  id: number;
  endpoint_id?: number;
  event: string;
  status: string;
  attempts: number;
  last_error?: string;
  created_at: string;
};

const FILTER_PRESETS = ["booking.*", "crm.*", "work_item.*", "workspace.*"] as const;

type Draft = {
  id: number | null;
  label: string;
  target_url: string;
  is_active: boolean;
  filter_text: string;
};

function emptyDraft(): Draft {
  return { id: null, label: "Endpoint", target_url: "", is_active: false, filter_text: "" };
}

export default function OutboundWebhookPage() {
  const auth = useAuth();
  const toast = useToast();
  const canRead = () => hasPermission(auth.me, "platform.outbound_webhook", "read");
  const canWrite = () => hasPermission(auth.me, "platform.outbound_webhook", "write");

  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [endpoints, setEndpoints] = createSignal<EndpointDTO[]>([]);
  const [draft, setDraft] = createSignal<Draft>(emptyDraft());
  const [shownSecret, setShownSecret] = createSignal<string | null>(null);
  const [deliveries, setDeliveries] = createSignal<DeliveryDTO[]>([]);

  const loadDeliveries = async () => {
    const res = await apiFetch<{ items: DeliveryDTO[] }>(
      "/api/v1/platform/integrations/outbound-webhook/deliveries",
    );
    if (res.success && res.data) setDeliveries(res.data.items ?? []);
  };

  const load = async () => {
    if (!canRead()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ endpoints: EndpointDTO[] }>("/api/v1/platform/integrations/outbound-webhook");
    setLoading(false);
    if (res.success && res.data) {
      setEndpoints(res.data.endpoints ?? []);
    } else {
      toast.error(res.message || "Failed to load webhook settings.");
    }
    void loadDeliveries();
  };

  createEffect(() => {
    void auth.me;
    void load();
  });

  const edit = (e: EndpointDTO) => {
    setDraft({
      id: e.id,
      label: e.label || "Endpoint",
      target_url: e.target_url || "",
      is_active: !!e.is_active,
      filter_text: (e.event_filter ?? []).join(", "),
    });
    setShownSecret(null);
  };

  const parseFilter = (text: string): string[] =>
    text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = async () => {
    if (!canWrite()) return;
    const d = draft();
    setSaving(true);
    const body = {
      label: d.label.trim() || "Endpoint",
      target_url: d.target_url.trim(),
      is_active: d.is_active,
      event_filter: parseFilter(d.filter_text),
    };
    const res =
      d.id == null
        ? await apiFetch<{ id: number }>("/api/v1/platform/integrations/outbound-webhook", {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await apiFetch<{ endpoints: EndpointDTO[] }>(
            `/api/v1/platform/integrations/outbound-webhook/${d.id}`,
            { method: "PUT", body: JSON.stringify(body) },
          );
    setSaving(false);
    if (res.success) {
      toast.success(d.id == null ? "Endpoint created." : "Endpoint saved.");
      setDraft(emptyDraft());
      void load();
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  const rotate = async (id: number) => {
    if (!canWrite()) return;
    setSaving(true);
    const res = await apiFetch<{ signing_secret: string }>(
      `/api/v1/platform/integrations/outbound-webhook/${id}/rotate-secret`,
      { method: "POST", body: "{}" },
    );
    setSaving(false);
    if (res.success && res.data?.signing_secret) {
      setShownSecret(res.data.signing_secret);
      toast.success("Secret rotated — copy it now.");
      void load();
    } else {
      toast.error(res.message || "Failed to rotate secret.");
    }
  };

  const remove = async (id: number) => {
    if (!canWrite()) return;
    if (!confirm("Delete this endpoint?")) return;
    setSaving(true);
    const res = await apiFetch(`/api/v1/platform/integrations/outbound-webhook/${id}`, {
      method: "DELETE",
    });
    setSaving(false);
    if (res.success) {
      toast.success("Endpoint deleted.");
      if (draft().id === id) setDraft(emptyDraft());
      void load();
    } else {
      toast.error(res.message || "Failed to delete.");
    }
  };

  const addPreset = (p: string) => {
    const cur = parseFilter(draft().filter_text);
    if (cur.includes(p)) return;
    setDraft({ ...draft(), filter_text: [...cur, p].join(", ") });
  };

  return (
    <div class="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-text-primary">Outbound webhooks</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Optional automation extension: push signed Bluearm events to{" "}
          <strong class="font-medium text-text-primary">your</strong> Make, Zapier, or n8n Cloud webhook URL. Bluearm
          does not host Make/n8n and is not a Make replacement — use Operations → Automation for simple in-app rules.
        </p>
        <p class="mt-2 text-xs text-text-secondary">
          Signature header:{" "}
          <code class="rounded bg-slate-100 px-1">X-Bluearm-Signature: sha256=&lt;hex&gt;</code> over the raw JSON body.
          Also sent: <code class="rounded bg-slate-100 px-1">X-Bluearm-Event</code>. Body shape:{" "}
          <code class="rounded bg-slate-100 px-1">{`{ event, tenant_id, occurred_at, payload }`}</code>.
        </p>
      </div>

      <Show
        when={canRead()}
        fallback={
          <p class="rounded-lg border border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
            You do not have permission to view outbound webhook settings.
          </p>
        }
      >
        <Show when={!loading()} fallback={<p class="text-sm text-text-secondary">Loading…</p>}>
          <div class="rounded-xl border border-dashed border-stroke bg-slate-50 px-4 py-3 text-xs text-text-secondary">
            <p class="font-medium text-text-primary">Event catalog (filter tips)</p>
            <ul class="mt-2 list-disc space-y-1 pl-4">
              <li>
                <code class="rounded bg-white px-1">booking.*</code> — booking.created, booking.status_changed
              </li>
              <li>
                <code class="rounded bg-white px-1">crm.*</code> — crm.follow_up.*, crm.alert.created
              </li>
              <li>
                <code class="rounded bg-white px-1">work_item.*</code> — created, column/status changed, quotation_created
              </li>
              <li>
                <code class="rounded bg-white px-1">workspace.*</code> — workspace.created
              </li>
            </ul>
            <p class="mt-2">
              BYO setup: create a Custom Webhook in Make/Zapier/n8n Cloud → paste HTTPS URL here → Rotate secret → set
              Active → verify signature with your signing secret → map one action (Slack, email, Sheets, …).
            </p>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-text-primary">Endpoints</h3>
            <Show
              when={endpoints().length > 0}
              fallback={<p class="text-xs text-text-secondary">No endpoints yet — add one below.</p>}
            >
              <ul class="divide-y divide-stroke rounded-xl border border-stroke bg-white">
                <For each={endpoints()}>
                  {(e) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <p class="font-medium text-text-primary">
                          {e.label || `Endpoint #${e.id}`}{" "}
                          <span class="text-xs font-normal text-text-secondary">
                            {e.is_active ? "active" : "off"}
                            {e.has_secret ? ` · ${e.secret_hint || "secret set"}` : " · no secret"}
                          </span>
                        </p>
                        <p class="truncate text-xs text-text-secondary">{e.target_url || "(no URL)"}</p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs disabled:opacity-50"
                          disabled={!canWrite() || saving()}
                          onClick={() => edit(e)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs disabled:opacity-50"
                          disabled={!canWrite() || saving()}
                          onClick={() => void rotate(e.id)}
                        >
                          Rotate secret
                        </button>
                        <button
                          type="button"
                          class="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                          disabled={!canWrite() || saving()}
                          onClick={() => void remove(e.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="space-y-4 rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <h3 class="text-sm font-semibold text-text-primary">
              {draft().id == null ? "Add endpoint" : `Edit endpoint #${draft().id}`}
            </h3>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-text-secondary">Label</span>
              <input
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={draft().label}
                disabled={!canWrite() || saving()}
                onInput={(e) => setDraft({ ...draft(), label: e.currentTarget.value })}
              />
            </label>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-text-secondary">Target URL</span>
              <input
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                type="url"
                placeholder="https://hooks.example.com/bluearm"
                value={draft().target_url}
                disabled={!canWrite() || saving()}
                onInput={(e) => setDraft({ ...draft(), target_url: e.currentTarget.value })}
              />
            </label>
            <label class="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={draft().is_active}
                disabled={!canWrite() || saving()}
                onChange={(e) => setDraft({ ...draft(), is_active: e.currentTarget.checked })}
              />
              Active
            </label>
            <div class="space-y-1">
              <span class="text-xs font-medium text-text-secondary">Event filter (empty = all)</span>
              <input
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                placeholder="booking.*, crm.*"
                value={draft().filter_text}
                disabled={!canWrite() || saving()}
                onInput={(e) => setDraft({ ...draft(), filter_text: e.currentTarget.value })}
              />
              <div class="flex flex-wrap gap-2 pt-1">
                <For each={[...FILTER_PRESETS]}>
                  {(p) => (
                    <button
                      type="button"
                      class="rounded-full border border-stroke px-2 py-0.5 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50"
                      disabled={!canWrite() || saving()}
                      onClick={() => addPreset(p)}
                    >
                      + {p}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Show when={shownSecret()}>
              <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p class="font-medium">Copy this secret now</p>
                <code class="mt-1 block break-all font-mono text-xs">{shownSecret()}</code>
                <button type="button" class="mt-2 text-xs font-medium underline" onClick={() => setShownSecret(null)}>
                  Dismiss
                </button>
              </div>
            </Show>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={!canWrite() || saving()}
                onClick={() => void save()}
              >
                {draft().id == null ? "Create" : "Save"}
              </button>
              <Show when={draft().id != null}>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-2 text-sm"
                  disabled={saving()}
                  onClick={() => setDraft(emptyDraft())}
                >
                  Cancel edit
                </button>
              </Show>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm text-text-secondary"
                disabled={saving()}
                onClick={() => void loadDeliveries()}
              >
                Refresh deliveries
              </button>
            </div>
            <p class="text-xs text-text-secondary">
              Create the endpoint, rotate secret, then set Active with a public https URL.
            </p>
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-text-primary">Recent deliveries</h3>
            <Show
              when={deliveries().length > 0}
              fallback={
                <p class="text-xs text-text-secondary">
                  No deliveries yet. Fire a booking/CRM event with an active endpoint.
                </p>
              }
            >
              <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
                <table class="min-w-full text-left text-xs">
                  <thead class="border-b border-stroke bg-slate-50 text-text-secondary">
                    <tr>
                      <th class="px-3 py-2 font-medium">ID</th>
                      <th class="px-3 py-2 font-medium">Endpoint</th>
                      <th class="px-3 py-2 font-medium">Event</th>
                      <th class="px-3 py-2 font-medium">Status</th>
                      <th class="px-3 py-2 font-medium">Attempts</th>
                      <th class="px-3 py-2 font-medium">Error</th>
                      <th class="px-3 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={deliveries()}>
                      {(d) => (
                        <tr class="border-b border-stroke last:border-0">
                          <td class="px-3 py-2 font-mono">{d.id}</td>
                          <td class="px-3 py-2">{d.endpoint_id ?? "—"}</td>
                          <td class="px-3 py-2">{d.event}</td>
                          <td class="px-3 py-2">{d.status}</td>
                          <td class="px-3 py-2">{d.attempts}</td>
                          <td class="max-w-xs truncate px-3 py-2 text-text-secondary" title={d.last_error || ""}>
                            {d.last_error || "—"}
                          </td>
                          <td class="px-3 py-2 text-text-secondary">{d.created_at}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
