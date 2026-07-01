import { createSignal, For, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import {
  addTicketComment,
  patchTicket,
  useInvalidateSupportTickets,
  useSupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "../../shared/useSupportTickets";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { SupportLayout } from "./SupportLayout";
import { fetchRepairOrders, fetchSupportUsers, fetchWarrantyAssets } from "./supportLookups";

export default function TicketDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateSupportTickets();
  const ticketId = () => Number(params.id) || null;
  const ticket = useSupportTicket(ticketId);

  const [comment, setComment] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [warrantyLabel, setWarrantyLabel] = createSignal("");
  const [assigneeLabel, setAssigneeLabel] = createSignal("");
  const [repairOrderLabel, setRepairOrderLabel] = createSignal("");

  const canWrite = () => hasPermission(auth.me, "support.tickets", "write");
  const canAssign = () =>
    hasPermission(auth.me, "support.tickets_assign", "write") || canWrite();

  const updateField = async (patch: Parameters<typeof patchTicket>[1]) => {
    const id = ticketId();
    if (!id) return;
    setSaving(true);
    const res = await patchTicket(id, patch);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Update failed.");
      return;
    }
    invalidate();
  };

  const postComment = async () => {
    const id = ticketId();
    const text = comment().trim();
    if (!id || !text) return;
    setSaving(true);
    const res = await addTicketComment(id, text);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add comment.");
      return;
    }
    setComment("");
    invalidate();
  };

  return (
    <SupportLayout>
      <div class="mb-4">
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => navigate("/app/support/tickets")}>
          ← Back to tickets
        </button>
      </div>

      <Show when={ticket.isFetching && !ticket.data} fallback={null}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>

      <Show when={ticket.data}>
        {(t) => (
          <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div class="rounded-xl border border-stroke bg-white p-6">
              <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{t().ticket_no}</p>
                  <h1 class="text-xl font-semibold text-text-primary">{t().subject}</h1>
                  <p class="mt-1 text-sm text-text-secondary">
                    {t().partner_name} · opened {t().ticket_date}
                    <Show when={t().created_by_name}> by {t().created_by_name}</Show>
                  </p>
                </div>
                <Show when={t().warranty_asset_id}>
                  <A
                    href={`/app/crm/warranty-assets?q=${encodeURIComponent(t().ticket_no)}`}
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
                  >
                    View warranty registry
                  </A>
                </Show>
              </div>

              <Show when={t().description}>
                <div class="mb-6 rounded-lg bg-slate-50 p-4 text-sm whitespace-pre-wrap">{t().description}</div>
              </Show>

              <Show when={t().repair_order_id}>
                <p class="mb-4 text-sm">
                  <span class="text-text-secondary">Repair order:</span>{" "}
                  <A href="/app/after-sales/repair-orders" class="text-brand-600 hover:underline">
                    #{t().repair_order_id}
                  </A>
                </p>
              </Show>

              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">Comments</h2>
              <div class="space-y-3">
                <For each={t().comments ?? []}>
                  {(c) => (
                    <div class="rounded-lg border border-stroke p-3">
                      <p class="text-xs text-text-secondary">
                        {c.author_name} · {c.created_at}
                      </p>
                      <p class="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                    </div>
                  )}
                </For>
                <Show when={(t().comments ?? []).length === 0}>
                  <p class="text-sm text-text-secondary">No comments yet.</p>
                </Show>
              </div>

              <Show when={canWrite()}>
                <div class="mt-4">
                  <textarea
                    class={inputClass}
                    rows={3}
                    placeholder="Add a comment…"
                    value={comment()}
                    onInput={(e) => setComment(e.currentTarget.value)}
                  />
                  <button
                    type="button"
                    class="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={saving() || !comment().trim()}
                    onClick={() => void postComment()}
                  >
                    Post comment
                  </button>
                </div>
              </Show>
            </div>

            <aside class="space-y-4 rounded-xl border border-stroke bg-white p-4">
              <Field label="Status">
                <select
                  class={inputClass}
                  value={t().status}
                  disabled={!canWrite() || saving()}
                  onChange={(e) => void updateField({ status: e.currentTarget.value as TicketStatus })}
                >
                  <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
                </select>
              </Field>
              <Field label="Priority">
                <select
                  class={inputClass}
                  value={t().priority}
                  disabled={!canWrite() || saving()}
                  onChange={(e) => void updateField({ priority: e.currentTarget.value as TicketPriority })}
                >
                  <For each={PRIORITY_OPTIONS}>{(p) => <option value={p}>{p}</option>}</For>
                </select>
              </Field>
              <Field label="Category">
                <input
                  class={inputClass}
                  value={t().category}
                  disabled={!canWrite() || saving()}
                  onChange={(e) => void updateField({ category: e.currentTarget.value })}
                />
              </Field>
              <Show when={canWrite()}>
                <LookupCombo
                  label="Warranty asset"
                  value={() => warrantyLabel() || (t().warranty_asset_id ? "Linked asset" : "")}
                  selectedId={() => t().warranty_asset_id ?? null}
                  onInput={setWarrantyLabel}
                  onSelect={(o) => void updateField({ warranty_asset_id: o.id })}
                  onClear={() => void updateField({ warranty_asset_id: null })}
                  fetchOptions={(q) => fetchWarrantyAssets(q, t().partner_id)}
                />
              </Show>
              <Show when={canAssign()}>
                <LookupCombo
                  label="Assigned to"
                  value={() => assigneeLabel() || t().assigned_name || ""}
                  selectedId={() => t().assigned_user_id ?? null}
                  onInput={setAssigneeLabel}
                  onSelect={(o) => void updateField({ assigned_user_id: o.id })}
                  onClear={() => void updateField({ assigned_user_id: null })}
                  fetchOptions={fetchSupportUsers}
                />
              </Show>
              <Show when={canWrite()}>
                <LookupCombo
                  label="Repair order"
                  value={() => repairOrderLabel() || (t().repair_order_id ? `RO #${t().repair_order_id}` : "")}
                  selectedId={() => t().repair_order_id ?? null}
                  onInput={setRepairOrderLabel}
                  onSelect={(o) => void updateField({ repair_order_id: o.id })}
                  onClear={() => void updateField({ repair_order_id: null })}
                  fetchOptions={(q) => fetchRepairOrders(q, t().partner_id)}
                />
              </Show>
              <div class="text-sm text-text-secondary">
                <Show when={!canAssign() && t().assigned_name}>
                  <p>
                    <span class="font-medium text-text-primary">Assigned:</span> {t().assigned_name}
                  </p>
                </Show>
                <Show when={t().resolved_at}>
                  <p class="mt-2">
                    <span class="font-medium text-text-primary">Resolved:</span> {t().resolved_at}
                  </p>
                </Show>
              </div>
            </aside>
          </div>
        )}
      </Show>
    </SupportLayout>
  );
}

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];
