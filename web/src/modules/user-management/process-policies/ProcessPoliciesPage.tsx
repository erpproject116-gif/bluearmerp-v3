import { createEffect, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { useAuth } from "../../../shared/auth-context";
import { isTenantModuleEnabled } from "../../../shared/moduleAccess";

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
  inventory_gl_hybrid_enabled: boolean;
  inventory_require_serial_adjustment_approval: boolean;
  inventory_require_stock_adjustment_approval: boolean;
  sales_require_so_approval: boolean;
  purchase_require_po_approval: boolean;
  finance_require_je_approval: boolean;
  budget_control_mode: string;
  quotation_require_attachment: boolean;
  sales_order_require_attachment: boolean;
  sales_require_attachment: boolean;
  purchase_order_require_attachment: boolean;
  supplier_invoice_require_attachment: boolean;
  ar_payment_discount_account_id?: number | null;
  ap_payment_discount_account_id?: number | null;
};

type PolicyField = {
  key: keyof ProcessPolicy;
  label: string;
  help: string;
};

type PolicySection = {
  id: string;
  title: string;
  blurb: string;
  fields: PolicyField[];
};

type BudgetControlMode = "off" | "warn" | "block";

const SECTIONS: PolicySection[] = [
  {
    id: "sales",
    title: "Sales flow",
    blurb: "Decide whether quote → order → delivery → invoice steps are required or skippable.",
    fields: [
      {
        key: "sales_require_quotation",
        label: "Require quotation before sales order",
        help: "Off by default. When on, sales orders without a source quotation are blocked.",
      },
      {
        key: "sales_require_so",
        label: "Require sales order before invoice",
        help: "Off by default. When on, New Sales without SO lines is blocked.",
      },
      {
        key: "sales_require_reservation",
        label: "Require stock reservation",
        help: "When on, SO release must reserve stock before delivery (split release mode).",
      },
      {
        key: "sales_require_delivery_receipt",
        label: "Require delivery receipt before invoice",
        help: "When on, posting a delivery receipt is required before invoicing from SO lines.",
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
    ],
  },
  {
    id: "purchase",
    title: "Purchase flow",
    blurb: "Control PR → PO → Purchase Receive → Bill gates.",
    fields: [
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
        label: "Require Purchase Receive before Bill (legacy)",
        help: "Off by default = Purchase Receive posts stock + serials on confirm. Leave off unless you still use separate Receive history.",
      },
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    blurb: "Send documents to e-Approval before fulfillment or posting.",
    fields: [
      {
        key: "sales_require_so_approval",
        label: "Require sales order approval",
        help: "When on, sales orders must be approved before release or invoicing.",
      },
      {
        key: "purchase_require_po_approval",
        label: "Require purchase order approval",
        help: "When on, purchase orders must be approved before Purchase Receive or Bill.",
      },
      {
        key: "finance_require_je_approval",
        label: "Require journal entry approval",
        help: "When on, journal entries must be approved before posting.",
      },
    ],
  },
  {
    id: "attachments",
    title: "Attachments",
    blurb: "Block confirm until at least one file is uploaded. Save as Unconfirmed first, then attach.",
    fields: [
      {
        key: "quotation_require_attachment",
        label: "Require attachment on quotation confirm",
        help: "Off by default. Turn on only if confirm must include a file.",
      },
      {
        key: "sales_order_require_attachment",
        label: "Require attachment on sales order confirm",
        help: "When on, sales orders need a file before In Progress or Completed.",
      },
      {
        key: "sales_require_attachment",
        label: "Require attachment on sales invoice confirm",
        help: "When on, sales invoices need a file before Completed or approval submit.",
      },
      {
        key: "purchase_order_require_attachment",
        label: "Require attachment on purchase order confirm",
        help: "When on, purchase orders need a file before Confirm.",
      },
      {
        key: "supplier_invoice_require_attachment",
        label: "Require attachment on Bill confirm",
        help: "When on, Bills need a file before Completed or approval submit.",
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting auto-post",
    blurb: "Create journal entries automatically when documents are saved or paid.",
    fields: [
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
        help: "When on, saving a sale (or the Invoice tab) posts the A/R journal when Sales + A/R defaults are mapped.",
      },
      {
        key: "accounts_auto_post_purchase",
        label: "Auto-post purchase invoice journal",
        help: "When on, saving the purchase Invoice tab posts the A/P journal entry immediately.",
      },
      {
        key: "inventory_gl_hybrid_enabled",
        label: "Hybrid inventory GL (qty-tracked items)",
        help: "When on, Purchase Receive and Sales of qty-tracked items post Inventory / GRNI / COGS. Map those accounts under CoA defaults first. Existing tenants need opening inventory before enabling.",
      },
      {
        key: "inventory_require_serial_adjustment_approval",
        label: "Require approval for serial qty fixes (threshold)",
        help: "Off by default. When on, Apply on Qty fix (serials) goes to Approvals Queue if there are 5+ lines or any positive qty change. Small negative-only fixes still post immediately.",
      },
      {
        key: "inventory_require_stock_adjustment_approval",
        label: "Stock quantity adjustments require approval (always on)",
        help: "Always on. Stock quantity changes never update on-hand inventory until a store admin or owner confirms in Approvals.",
      },
    ],
  },
];

const BUDGET_CONTROL_OPTIONS: { value: BudgetControlMode; label: string }[] = [
  { value: "off", label: "Off — no budget checks" },
  { value: "warn", label: "Warn — allow but show warnings" },
  { value: "block", label: "Block — prevent over-budget transactions" },
];

const ALL_BOOLEAN_FIELDS = SECTIONS.flatMap((s) => s.fields);

type PresetId = "flexible" | "full_process" | "attachments_light";

const PRESETS: { id: PresetId; label: string; help: string; apply: (p: ProcessPolicy) => ProcessPolicy }[] = [
  {
    id: "flexible",
    label: "Flexible (counter / SME)",
    help: "All require-* gates off. Direct sales and purchases stay open.",
    apply: (p) => ({
      ...p,
      sales_require_quotation: false,
      sales_require_so: false,
      sales_require_reservation: false,
      sales_require_delivery_receipt: false,
      purchase_require_pr: false,
      purchase_require_pr_approval: false,
      purchase_require_gr_before_supplier_invoice: false,
      sales_require_so_approval: false,
      purchase_require_po_approval: false,
      finance_require_je_approval: false,
      inventory_require_serial_adjustment_approval: false,
      inventory_require_stock_adjustment_approval: true,
      quotation_require_attachment: false,
      sales_order_require_attachment: false,
      sales_require_attachment: false,
      purchase_order_require_attachment: false,
      supplier_invoice_require_attachment: false,
      budget_control_mode: "off",
    }),
  },
  {
    id: "full_process",
    label: "Full process",
    help: "Quote → SO → invoice and PR → PO with approvals and attachments on.",
    apply: (p) => ({
      ...p,
      sales_require_quotation: true,
      sales_require_so: true,
      purchase_require_pr: true,
      purchase_require_pr_approval: true,
      sales_require_so_approval: true,
      purchase_require_po_approval: true,
      sales_order_require_attachment: true,
      sales_require_attachment: true,
      purchase_order_require_attachment: true,
      supplier_invoice_require_attachment: true,
    }),
  },
  {
    id: "attachments_light",
    label: "Attachments only",
    help: "Keep flow gates flexible; require files on invoice/PO confirm.",
    apply: (p) => ({
      ...p,
      sales_require_quotation: false,
      sales_require_so: false,
      purchase_require_pr: false,
      quotation_require_attachment: false,
      sales_order_require_attachment: false,
      sales_require_attachment: true,
      purchase_order_require_attachment: true,
      supplier_invoice_require_attachment: true,
    }),
  },
];

export default function ProcessPoliciesPage() {
  const toast = useToast();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [moduleEnabled, setModuleEnabled] = createSignal(true);
  const [policy, setPolicy] = createSignal<ProcessPolicy | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{
      policy: ProcessPolicy;
      can_manage: boolean;
      module_enabled?: boolean;
    }>("/api/v1/settings/process-policies");
    setLoading(false);
    if (res.success && res.data) {
      setPolicy(res.data.policy);
      setCanManage(!!res.data.can_manage);
      setModuleEnabled(res.data.module_enabled !== false);
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

  const applyPreset = (id: PresetId) => {
    const p = policy();
    const preset = PRESETS.find((x) => x.id === id);
    if (!p || !preset || !canManage()) return;
    setPolicy(preset.apply(p));
    toast.success(`Applied “${preset.label}” — review, then Save.`);
  };

  const save = async () => {
    const p = policy();
    if (!p || !canManage()) return;
    setSaving(true);
    const body: Record<string, boolean | string> = {};
    for (const f of ALL_BOOLEAN_FIELDS) {
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
          Global commercial gates for this workspace. Turn the whole module off under Modules &amp; Features
          to bypass every require-* rule at once (stored toggles are kept for later).
        </p>
      </div>

      <Show when={!moduleEnabled()}>
        <div class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p class="font-medium">Process Policies module is off</p>
          <p class="mt-1 text-amber-900/90">
            All flow gates, attachment rules, approvals, and budget checks are bypassed on transactions.
            Settings below still edit the stored policy and will apply again when you turn the module on.
          </p>
          <A href="/app/user-management/tenant-modules" class="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
            Open Modules &amp; Features →
          </A>
        </div>
      </Show>

      <Show
        when={
          !isTenantModuleEnabled(auth.me, "quotation") ||
          !isTenantModuleEnabled(auth.me, "sales_order") ||
          !isTenantModuleEnabled(auth.me, "purchase_request")
        }
      >
        <div class="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p class="font-medium">Some steps are controlled by Modules &amp; Features</p>
          <p class="mt-1 text-sky-900/90">
            When Quotation, Sales Order, or Purchase Request is hidden, matching “require…” gates are turned off
            on save from Modules &amp; Features so staff are not blocked.
          </p>
          <A href="/app/user-management/tenant-modules" class="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
            Open Modules &amp; Features →
          </A>
        </div>
      </Show>

      <Show when={!loading()} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <Show
          when={policy()}
          keyed
          fallback={
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Could not load process policies. Confirm migrations{" "}
              <code class="font-mono text-xs">051_tenant_process_policies.sql</code> and{" "}
              <code class="font-mono text-xs">216_process_policies_module.sql</code> have been applied, then refresh.
            </p>
          }
        >
          {(p) => (
            <div class="space-y-6">
              <Show when={canManage()}>
                <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 class="text-sm font-semibold text-slate-900">Quick presets</h2>
                  <p class="mt-1 text-xs text-slate-500">Applies to the form only — click Save to persist.</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <For each={PRESETS}>
                      {(preset) => (
                        <button
                          type="button"
                          class="rounded-lg border border-stroke px-3 py-2 text-left text-sm hover:bg-slate-50"
                          title={preset.help}
                          onClick={() => applyPreset(preset.id)}
                        >
                          <span class="font-medium text-slate-900">{preset.label}</span>
                          <span class="mt-0.5 block text-xs text-slate-500">{preset.help}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <For each={SECTIONS}>
                {(section) => (
                  <section class="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div>
                      <h2 class="text-sm font-semibold text-slate-900">{section.title}</h2>
                      <p class="mt-0.5 text-xs text-slate-500">{section.blurb}</p>
                    </div>
                    <For each={section.fields}>
                      {(field) => (
                        <label class="flex cursor-pointer gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
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
                  </section>
                )}
              </For>

              <section class="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <h2 class="text-sm font-semibold text-slate-900">Budget</h2>
                  <p class="mt-0.5 text-xs text-slate-500">How strictly to enforce budget limits on purchases and expenses.</p>
                </div>
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
              </section>

              <section class="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <h2 class="text-sm font-semibold text-slate-900">Payment discount GL accounts</h2>
                  <p class="mt-0.5 text-xs text-slate-500">
                    Required before Discount Amount on New Receivable/Payable Payment. Use Chart of Accounts account ids
                    (expense/income). Discounts will not post silently without these.
                  </p>
                </div>
                <label class="block text-sm">
                  <span class="font-medium text-slate-900">AR payment discount account id</span>
                  <input
                    type="number"
                    class="mt-1 w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                    value={p.ar_payment_discount_account_id ?? ""}
                    disabled={!canManage()}
                    placeholder="e.g. sales discount expense"
                    onInput={(e) => {
                      const v = e.currentTarget.value.trim();
                      setPolicy({
                        ...p,
                        ar_payment_discount_account_id: v ? Number(v) : null,
                      });
                    }}
                  />
                </label>
                <label class="block text-sm">
                  <span class="font-medium text-slate-900">AP payment discount account id</span>
                  <input
                    type="number"
                    class="mt-1 w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                    value={p.ap_payment_discount_account_id ?? ""}
                    disabled={!canManage()}
                    placeholder="e.g. purchase discount income"
                    onInput={(e) => {
                      const v = e.currentTarget.value.trim();
                      setPolicy({
                        ...p,
                        ap_payment_discount_account_id: v ? Number(v) : null,
                      });
                    }}
                  />
                </label>
              </section>

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
