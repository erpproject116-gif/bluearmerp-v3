import { A, useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import {
  MODULE_SETUP_SCOPES,
  setupScopeFromPath,
  type ModuleSetupScope,
} from "../../shared/moduleSetupScopes";

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
  sales_require_so_approval: boolean;
  purchase_require_po_approval: boolean;
  finance_require_je_approval: boolean;
  budget_control_mode: string;
  quotation_require_attachment: boolean;
  sales_order_require_attachment: boolean;
  sales_require_attachment: boolean;
  purchase_order_require_attachment: boolean;
  supplier_invoice_require_attachment: boolean;
  [key: string]: boolean | number | string;
};

/** Labels aligned with ProcessPoliciesPage — plain language for non-tech admins. */
const FIELD_META: Record<string, { label: string; help: string }> = {
  sales_require_quotation: {
    label: "Require quotation before sales order",
    help: "Off = staff can create a sales order without a quote first.",
  },
  sales_require_so: {
    label: "Require sales order before invoice",
    help: "Off = staff can create a sales invoice directly (counter / simple sales).",
  },
  sales_require_reservation: {
    label: "Require stock reservation on release",
    help: "On = pick list must reserve stock before delivery.",
  },
  sales_require_delivery_receipt: {
    label: "Require delivery receipt before invoice",
    help: "On = deliver before billing from a sales order.",
  },
  legacy_combined_so_release: {
    label: "Combined pick (reserve + deduct together)",
    help: "Legacy mode for tenants not using separate delivery receipts.",
  },
  sales_enforce_credit_limit: {
    label: "Block sales over customer credit limit",
    help: "On = cannot invoice if the customer is over their credit limit.",
  },
  sales_require_so_approval: {
    label: "Require approval on sales orders (advisory)",
    help: "Recorded for process design; conversion gates are currently relaxed in the API.",
  },
  quotation_require_attachment: {
    label: "Require file on quotation",
    help: "Off by default. Turn on only if every quote must have an attached file.",
  },
  sales_order_require_attachment: {
    label: "Require file on sales order",
    help: "On = sales order needs an uploaded file before it can progress.",
  },
  sales_require_attachment: {
    label: "Require file on sales invoice",
    help: "On = invoice needs an uploaded file before completion.",
  },
  purchase_require_pr: {
    label: "Require purchase request before PO",
    help: "Off = buyers can create a purchase order directly.",
  },
  purchase_require_pr_approval: {
    label: "Require approved purchase request (advisory)",
    help: "Recorded for process design; PR→PO conversion gates are currently relaxed in the API.",
  },
  purchase_require_po_approval: {
    label: "Require approval on purchase orders (advisory)",
    help: "Recorded for process design; PO conversion gates are currently relaxed in the API.",
  },
  purchase_require_gr_before_supplier_invoice: {
    label: "Require goods receipt before supplier invoice",
    help: "On = bill only after Receiving. Off (default) = Purchases can auto-receive stock when you save.",
  },
  purchase_order_require_attachment: {
    label: "Require file on purchase order",
    help: "On = PO needs an uploaded file before confirm.",
  },
  supplier_invoice_require_attachment: {
    label: "Require file on purchase invoice",
    help: "On = supplier invoice needs an uploaded file before completion.",
  },
  accounts_auto_post_or: {
    label: "Auto-post official receipts to journal",
    help: "On = customer payments create journal entries automatically.",
  },
  accounts_auto_post_pv: {
    label: "Auto-post payment vouchers to journal",
    help: "On = supplier payments create journal entries automatically.",
  },
  accounts_auto_post_sales: {
    label: "Auto-post sales invoices to journal",
    help: "On = sales invoices post A/R journal entries when saved on the Invoice tab.",
  },
  accounts_auto_post_purchase: {
    label: "Auto-post purchase invoices to journal",
    help: "On = purchase invoices post A/P journal entries when saved on the Invoice tab.",
  },
  inventory_gl_hybrid_enabled: {
    label: "Hybrid inventory GL (qty-tracked items)",
    help: "On = Receiving/Sales of qty-tracked items post Inventory / GRNI / COGS. Map those accounts under CoA defaults first.",
  },
  finance_require_je_approval: {
    label: "Require approval before posting journals",
    help: "On = journal entries must be approved before they post.",
  },
};

type BudgetControlMode = "off" | "warn" | "block";

export default function ModuleSetupHubPage() {
  const loc = useLocation();
  const toast = useToast();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [policy, setPolicy] = createSignal<ProcessPolicy | null>(null);

  const scope = (): ModuleSetupScope | null => {
    const id = setupScopeFromPath(loc.pathname);
    return id ? MODULE_SETUP_SCOPES[id] ?? null : null;
  };

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
      toast.error(res.message || "Failed to load setup rules.");
    }
  };

  createEffect(() => {
    void load();
  });

  const toggle = (key: string) => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({ ...p, [key]: !p[key] });
  };

  const setBudgetMode = (mode: BudgetControlMode) => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({ ...p, budget_control_mode: mode });
  };

  const enableGoLivePosting = () => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({
      ...p,
      accounts_auto_post_or: true,
      accounts_auto_post_pv: true,
      accounts_auto_post_sales: true,
      accounts_auto_post_purchase: true,
    });
    toast.success("Auto-post toggles turned on — click Save to apply. Map CoA defaults first if Trial Balance stays empty.");
  };

  const save = async () => {
    const p = policy();
    const sc = scope();
    if (!p || !canManage() || !sc) return;
    setSaving(true);
    const body: Record<string, boolean | string> = {};
    for (const key of sc.policyKeys) {
      body[key] = !!p[key];
    }
    if (sc.showBudgetControl) {
      body.budget_control_mode = p.budget_control_mode || "off";
    }
    const res = await apiFetch<ProcessPolicy>("/api/v1/settings/process-policies", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.success && res.data) {
      setPolicy(res.data);
      toast.success("Setup saved.");
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  const canOpenModules = () =>
    hasPermission(auth.me, "settings.tenant_modules", "write") ||
    hasPermission(auth.me, "settings.tenant_modules", "read") ||
    Boolean(auth.me?.user?.is_tenant_owner || auth.me?.user?.is_store_admin);

  return (
    <div class="mx-auto max-w-3xl space-y-6">
      <Show when={scope()} fallback={<p class="text-sm text-text-secondary">Unknown setup page.</p>}>
        {(sc) => (
          <>
            <div>
              <h1 class="text-xl font-semibold text-text-primary">{sc().title}</h1>
              <p class="mt-1 text-sm text-text-secondary">{sc().blurb}</p>
              <p class="mt-2 text-xs text-text-secondary">
                These are the same workspace rules as Process policies — shown here so you do not leave this module.
              </p>
            </div>

            <Show when={loading()}>
              <p class="text-sm text-text-secondary">Loading…</p>
            </Show>

            <Show when={!loading() && policy()}>
              <section class="space-y-3 rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h2 class="text-sm font-semibold text-text-primary">Process rules</h2>
                <ul class="divide-y divide-stroke/60">
                  <For each={sc().policyKeys}>
                    {(key) => {
                      const meta = FIELD_META[key] ?? { label: key, help: "" };
                      return (
                        <li class="flex flex-wrap items-start justify-between gap-3 py-3">
                          <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-text-primary">{meta.label}</p>
                            <p class="mt-0.5 text-xs text-text-secondary">{meta.help}</p>
                          </div>
                          <label class="flex shrink-0 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              class="h-4 w-4"
                              checked={Boolean(policy()![key])}
                              disabled={!canManage()}
                              onChange={() => toggle(key)}
                            />
                            <span class="text-text-secondary">{policy()![key] ? "On" : "Off"}</span>
                          </label>
                        </li>
                      );
                    }}
                  </For>
                </ul>

                <Show when={sc().showBudgetControl}>
                  <div class="border-t border-stroke pt-3">
                    <p class="text-sm font-medium text-text-primary">Budget control</p>
                    <select
                      class="mt-2 w-full max-w-md rounded-lg border border-stroke px-3 py-2 text-sm"
                      disabled={!canManage()}
                      value={(policy()!.budget_control_mode as string) || "off"}
                      onChange={(e) => setBudgetMode(e.currentTarget.value as BudgetControlMode)}
                    >
                      <option value="off">Off — no budget checks</option>
                      <option value="warn">Warn — allow but show warnings</option>
                      <option value="block">Block — prevent over-budget transactions</option>
                    </select>
                  </div>
                </Show>

                <div class="flex flex-wrap items-center gap-2 pt-2">
                  <Show when={sc().id === "finance" && canManage()}>
                    <button
                      type="button"
                      class="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      disabled={saving()}
                      onClick={() => enableGoLivePosting()}
                    >
                      Go-live posting (turn on all auto-post)
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    disabled={!canManage() || saving()}
                    onClick={() => void save()}
                  >
                    {saving() ? "Saving…" : "Save setup"}
                  </button>
                  <Show when={!canManage()}>
                    <span class="text-xs text-text-secondary">Ask an administrator to change these rules.</span>
                  </Show>
                </div>
                <Show when={sc().id === "finance"}>
                  <p class="pt-2 text-xs text-text-secondary">
                    Hybrid inventory GL posts Inventory/GRNI/COGS only for qty-tracked items. Existing tenants with stock
                    already on hand should post an opening Inventory journal and clear historical GRNI before enabling
                    hybrid — do not rewrite old purchase expense journals.
                  </p>
                </Show>
              </section>
            </Show>

            <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">Show or hide steps</h2>
              <p class="mt-1 text-xs text-text-secondary">
                Turn whole modules or features off (for example hide Quotation) under Modules &amp; Features. That
                removes them from the menu for everyone.
              </p>
              <Show when={sc().modulesHref && canOpenModules()}>
                <A
                  href={sc().modulesHref!}
                  class="mt-3 inline-flex text-sm font-medium text-brand-600 hover:underline"
                >
                  Open Modules &amp; Features →
                </A>
              </Show>
              <A
                href="/app/user-management/process-policies"
                class="mt-2 block text-xs text-text-secondary hover:underline"
              >
                View all process policies (advanced)
              </A>
            </section>
          </>
        )}
      </Show>
    </div>
  );
}
