import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { DashboardLayout } from "./DashboardLayout";
import { uiLabel } from "../../shared/branding/uiLabel";

type ApprovalRequest = {
  id: number;
  entity_type: string;
  entity_id: number;
  status: string;
  submitted_at: string;
  submitted_by?: string;
  entity_label?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  sales_order: "Sales Order",
  purchase_order: "Purchase Order",
  purchase_request: "Purchase Request",
  journal_entry: "Journal Entry",
  collective_invoice: "Collective Invoice",
  sa_sales: "Sales",
};

function entityLabel(type: string): string {
  return ENTITY_LABELS[type] ?? type.replace(/_/g, " ");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ApprovalsQueuePage() {
  const toast = useToast();
  const [loading, setLoading] = createSignal(true);
  const [items, setItems] = createSignal<ApprovalRequest[]>([]);
  const [busyKey, setBusyKey] = createSignal<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<ApprovalRequest[]>("/api/v1/approvals/pending");
    setLoading(false);
    if (res.success && res.data) {
      setItems(res.data);
    } else {
      toast.error(res.message ?? "Failed to load approvals queue.");
    }
  };

  createEffect(() => {
    void load();
  });

  const decide = async (row: ApprovalRequest, approve: boolean) => {
    const action = approve ? "approve" : "reject";
    const key = `${row.entity_type}:${row.entity_id}:${action}`;
    setBusyKey(key);
    let res;
    if (row.entity_type === "sa_sales") {
      if (approve) {
        res = await apiFetch(`/api/v1/sales/${row.entity_id}/approve`, { method: "POST", body: JSON.stringify({}) });
      } else {
        const remarks = window.prompt("Rejection remarks (required):");
        if (remarks === null) {
          setBusyKey(null);
          return;
        }
        if (!remarks.trim()) {
          setBusyKey(null);
          toast.warning("Rejection remarks are required.");
          return;
        }
        res = await apiFetch(`/api/v1/sales/${row.entity_id}/reject`, {
          method: "POST",
          body: JSON.stringify({ remarks: remarks.trim() }),
        });
      }
    } else {
      res = await apiFetch(`/api/v1/approvals/${row.entity_type}/${row.entity_id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }
    setBusyKey(null);
    if (!res.success) {
      toast.error(res.message ?? `Failed to ${action}.`);
      return;
    }
    toast.success(res.message ?? (approve ? "Approved." : "Rejected."));
    void load();
  };

  return (
    <DashboardLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Approvals queue</h2>
          <p class="text-sm text-text-secondary">Documents waiting for your approval decision.</p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <Show when={!loading()} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show
          when={items().length > 0}
          fallback={
            <p class="rounded-xl border border-stroke bg-white px-6 py-10 text-center text-sm text-text-secondary shadow-sm">
              No documents pending approval.
            </p>
          }
        >
          <div class="overflow-hidden rounded-xl border border-stroke bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-4 py-3">Document</th>
                  <th class="px-4 py-3">Type</th>
                  <th class="px-4 py-3">Submitted</th>
                  <th class="px-4 py-3">Submitted by</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <For each={items()}>
                  {(row) => {
                    const approveKey = () => `${row.entity_type}:${row.entity_id}:approve`;
                    const rejectKey = () => `${row.entity_type}:${row.entity_id}:reject`;
                    const busy = () => busyKey() === approveKey() || busyKey() === rejectKey();
                    return (
                      <tr class="border-t border-stroke/60">
                        <td class="px-4 py-3 font-medium text-text-primary">
                          {row.entity_label ?? `#${row.entity_id}`}
                        </td>
                        <td class="px-4 py-3 text-text-secondary">{entityLabel(row.entity_type)}</td>
                        <td class="px-4 py-3 text-text-secondary">{formatDate(row.submitted_at)}</td>
                        <td class="px-4 py-3 text-text-secondary">{row.submitted_by || "—"}</td>
                        <td class="px-4 py-3 text-right">
                          <div class="flex justify-end gap-2">
                            <button
                              type="button"
                              class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                              disabled={busy()}
                              onClick={() => void decide(row, true)}
                            >
                              {busyKey() === approveKey() ? "…" : "Approve"}
                            </button>
                            <button
                              type="button"
                              class="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                              disabled={busy()}
                              onClick={() => void decide(row, false)}
                            >
                              {busyKey() === rejectKey() ? "…" : "Reject"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </DashboardLayout>
  );
}
