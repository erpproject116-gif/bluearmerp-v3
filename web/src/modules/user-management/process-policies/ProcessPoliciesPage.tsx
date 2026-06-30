import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";

type ProcessPolicy = {
  tenant_id: number;
  sales_require_quotation: boolean;
  sales_require_so: boolean;
  sales_require_reservation: boolean;
  sales_require_delivery_receipt: boolean;
  purchase_require_pr: boolean;
  purchase_require_pr_approval: boolean;
  purchase_require_gr_before_supplier_invoice: boolean;
  legacy_combined_so_release: boolean;
};

type PolicyField = {
  key: keyof ProcessPolicy;
  label: string;
  help: string;
};

const FIELDS: PolicyField[] = [
  {
    key: "sales_require_quotation",
    label: "Require quotation before sales order",
    help: "When on, standalone sales orders without a source quotation are blocked.",
  },
  {
    key: "sales_require_so",
    label: "Require sales order before invoice",
    help: "When on, direct sales invoices (without SO lines) are blocked.",
  },
  {
    key: "sales_require_reservation",
    label: "Require stock reservation",
    help: "When on, SO release must reserve stock before delivery (split release mode).",
  },
  {
    key: "sales_require_delivery_receipt",
    label: "Require delivery receipt before invoice",
    help: "When on, posting a delivery receipt is required before invoicing from SO lines (split release mode).",
  },
  {
    key: "purchase_require_pr",
    label: "Require purchase request before PO",
    help: "When on, standalone purchase orders without a PR are blocked.",
  },
  {
    key: "purchase_require_pr_approval",
    label: "Require PR approval before PO",
    help: "When on, PO from PR is allowed only when PR progress is Confirmed.",
  },
  {
    key: "purchase_require_gr_before_supplier_invoice",
    label: "Require goods receipt before supplier invoice",
    help: "When on, supplier invoices must link to posted goods receipt lines.",
  },
  {
    key: "legacy_combined_so_release",
    label: "Legacy combined SO release (reserve + deduct together)",
    help: "Keep on for existing tenants until delivery receipt is enabled.",
  },
];

export default function ProcessPoliciesPage() {
  const toast = useToast();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [policy, setPolicy] = createSignal<ProcessPolicy | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ policy: ProcessPolicy; can_manage: boolean }>(
      "/api/v1/settings/process-policies",
    );
    setLoading(false);
    if (res.success && res.data) {
      setPolicy(res.data.policy);
      setCanManage(!!res.data.can_manage);
    } else {
      toast.error(res.message || "Failed to load process policies.");
    }
  };

  createEffect(() => {
    void load();
  });

  const toggle = (key: keyof ProcessPolicy) => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({ ...p, [key]: !p[key] });
  };

  const save = async () => {
    const p = policy();
    if (!p || !canManage()) return;
    setSaving(true);
    const body: Record<string, boolean> = {};
    for (const f of FIELDS) {
      body[f.key] = !!p[f.key];
    }
    const res = await apiFetch<ProcessPolicy>("/api/v1/settings/process-policies", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.success && res.data) {
      setPolicy(res.data);
      toast.success("Process policies saved.");
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  return (
    <div class="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Process flow policies</h1>
        <p class="mt-1 text-sm text-slate-600">
          Control which commercial steps are required vs skippable for this tenant. Defaults allow
          shortcuts (direct PO, direct SI) for procurement and counter sales.
        </p>
      </div>

      <Show when={!loading()} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <Show
          when={policy()}
          keyed
          fallback={
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Could not load process policies. Confirm migration{" "}
              <code class="font-mono text-xs">051_tenant_process_policies.sql</code> has been applied,
              then refresh.
            </p>
          }
        >
          {(p) => (
            <div class="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <For each={FIELDS}>
                {(field) => (
                  <label class="flex cursor-pointer gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <input
                      type="checkbox"
                      class="mt-1 h-4 w-4"
                      checked={!!p[field.key]}
                      disabled={!canManage()}
                      onChange={() => toggle(field.key)}
                    />
                    <span>
                      <span class="block text-sm font-medium text-slate-900">{field.label}</span>
                      <span class="block text-xs text-slate-500">{field.help}</span>
                    </span>
                  </label>
                )}
              </For>

              <Show when={canManage()}>
                <button
                  type="button"
                  class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={saving()}
                  onClick={() => void save()}
                >
                  {saving() ? "Saving…" : "Save policies"}
                </button>
              </Show>
              <Show when={!canManage()}>
                <p class="text-xs text-amber-700">Ask your store admin to change process policies.</p>
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
