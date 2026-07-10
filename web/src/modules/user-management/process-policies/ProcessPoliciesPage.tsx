import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";

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
  sales_enforce_credit_limit: boolean;
  accounts_auto_post_or: boolean;
  accounts_auto_post_pv: boolean;
  accounts_auto_post_sales: boolean;
  accounts_auto_post_purchase: boolean;
  sales_require_so_approval: boolean;
  purchase_require_po_approval: boolean;
  finance_require_je_approval: boolean;
  budget_control_mode: string;
  quotation_require_attachment: boolean;
  sales_order_require_attachment: boolean;
  sales_require_attachment: boolean;
  purchase_order_require_attachment: boolean;
  supplier_invoice_require_attachment: boolean;
};

type PolicyField = {
  key: keyof ProcessPolicy;
  label: string;
  help: string;
};

type BudgetControlMode = "off" | "warn" | "block";

const BOOLEAN_FIELDS: PolicyField[] = [
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
  {
    key: "sales_enforce_credit_limit",
    label: "Enforce customer credit limit",
    help: "When on, new sales invoices are blocked if open A/R plus the invoice exceeds the partner credit limit.",
  },
  {
    key: "accounts_auto_post_or",
    label: "Auto-post official receipts to journal",
    help: "When on, payment receipts create posted journal entries (requires chart of accounts).",
  },
  {
    key: "accounts_auto_post_pv",
    label: "Auto-post payment vouchers to journal",
    help: "When on, supplier payment vouchers create posted journal entries.",
  },
  {
    key: "accounts_auto_post_sales",
    label: "Auto-post sales invoice journal",
    help: "When on, saving the sales Invoice tab posts the A/R journal entry immediately.",
  },
  {
    key: "accounts_auto_post_purchase",
    label: "Auto-post purchase invoice journal",
    help: "When on, saving the purchase Invoice tab posts the A/P journal entry immediately.",
  },
  {
    key: "sales_require_so_approval",
    label: "Require sales order approval",
    help: "When on, sales orders must be approved before release or invoicing.",
  },
  {
    key: "purchase_require_po_approval",
    label: "Require purchase order approval",
    help: "When on, purchase orders must be approved before goods receipt or invoicing.",
  },
  {
    key: "finance_require_je_approval",
    label: "Require journal entry approval",
    help: "When on, journal entries must be approved before posting.",
  },
  {
    key: "quotation_require_attachment",
    label: "Require attachment on quotation confirm",
    help: "When on, quotations must have at least one uploaded file before In Progress or Completed.",
  },
  {
    key: "sales_order_require_attachment",
    label: "Require attachment on sales order confirm",
    help: "When on, sales orders must have at least one uploaded file before In Progress or Completed.",
  },
  {
    key: "sales_require_attachment",
    label: "Require attachment on sales invoice confirm",
    help: "When on, sales invoices must have at least one uploaded file before Completed or approval submit.",
  },
  {
    key: "purchase_order_require_attachment",
    label: "Require attachment on purchase order confirm",
    help: "When on, purchase orders must have at least one uploaded file before Confirm on the list.",
  },
  {
    key: "supplier_invoice_require_attachment",
    label: "Require attachment on purchase (supplier invoice) confirm",
    help: "When on, purchases must have at least one uploaded file before Completed or approval submit.",
  },
];

const BUDGET_CONTROL_OPTIONS: { value: BudgetControlMode; label: string }[] = [
  { value: "off", label: "Off — no budget checks" },
  { value: "warn", label: "Warn — allow but show warnings" },
  { value: "block", label: "Block — prevent over-budget transactions" },
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

  const setBudgetMode = (mode: BudgetControlMode) => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({ ...p, budget_control_mode: mode });
  };

  const save = async () => {
    const p = policy();
    if (!p || !canManage()) return;
    setSaving(true);
    const body: Record<string, boolean | string> = {};
    for (const f of BOOLEAN_FIELDS) {
      body[f.key] = !!p[f.key];
    }
    body.budget_control_mode = p.budget_control_mode || "off";
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

      <Show when={!loading()} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
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
              <For each={BOOLEAN_FIELDS}>
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

              <label class="block border-b border-slate-100 pb-4">
                <span class="block text-sm font-medium text-slate-900">Budget control mode</span>
                <span class="mb-2 block text-xs text-slate-500">
                  How strictly to enforce budget limits on purchases and expenses.
                </span>
                <select
                  class="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                  value={p.budget_control_mode || "off"}
                  disabled={!canManage()}
                  onChange={(e) => setBudgetMode(e.currentTarget.value as BudgetControlMode)}
                >
                  <For each={BUDGET_CONTROL_OPTIONS}>
                    {(opt) => <option value={opt.value}>{opt.label}</option>}
                  </For>
                </select>
              </label>

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
