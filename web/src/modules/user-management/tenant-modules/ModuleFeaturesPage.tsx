import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useAuth } from "../../../shared/auth-context";
import type { TenantModuleRow } from "../../../shared/moduleAccess";
import { useToast } from "../../../shared/toast";
import { LoadingText } from "../../../shared/LoadingText";

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  "inventory.serial_lot": "Serial & Lot",
  after_sales: "After-Sales",
  quotation: "Quotation",
  "quotation.tax_mngt": "Tax Management",
  sales: "Sales",
  "sales.collective_invoicing": "Collective Invoicing (Sales)",
  sales_order: "Sales Order",
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
  crm: "CRM",
  finance: "Accounting Dept",
  activity_logs: "Activity Logs",
  operations: "Project Management",
  documentation: "Help & guides",
  user_management: "User Management",
};

function groupFor(row: TenantModuleRow): string {
  if (row.module_type === "feature" && row.parent_module) {
    if (row.parent_module === "inventory") return "Stocks Management";
    if (row.parent_module === "quotation" || row.parent_module === "sales" || row.parent_module === "sales_order") {
      return "Sales Process";
    }
  }
  if (row.module_code === "inventory" || row.module_code === "after_sales") return "Stocks Management";
  if (
    row.module_code === "quotation" ||
    row.module_code === "sales" ||
    row.module_code === "sales_order"
  ) {
    return "Sales Process";
  }
  if (row.module_code === "purchase_request" || row.module_code === "purchase_order") {
    return "Procurement Process";
  }
  if (
    row.module_code === "activity_logs" ||
    row.module_code === "documentation" ||
    row.module_code === "user_management"
  ) {
    return "Misc";
  }
  if (row.module_code === "crm" || row.module_code === "finance") {
    return "CRM & Finance";
  }
  return "Other";
}

export default function ModuleFeaturesPage() {
  const toast = useToast();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [rows, setRows] = createSignal<TenantModuleRow[]>([]);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ modules: TenantModuleRow[]; can_manage: boolean }>(
      "/api/v1/user-management/tenant-modules",
    );
    setLoading(false);
    if (res.success && res.data) {
      setRows(res.data.modules ?? []);
      setCanManage(!!res.data.can_manage);
    } else {
      toast.error(res.message || "Failed to load modules.");
    }
  };

  createEffect(() => {
    void load();
  });

  const grouped = () => {
    const map = new Map<string, TenantModuleRow[]>();
    for (const r of rows()) {
      const g = groupFor(r);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    const order = ["Stocks Management", "Sales Process", "Procurement Process", "CRM & Finance", "Other", "Misc"];
    return order.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  };

  const isEmpty = () => !loading() && rows().length === 0;

  const toggle = (code: string) => {
    if (!canManage()) return;
    setRows((prev) =>
      prev.map((r) => (r.module_code === code ? { ...r, is_enabled: !r.is_enabled } : r)),
    );
  };

  const save = async () => {
    if (!canManage()) return;
    setSaving(true);
    const res = await apiFetch<{ modules: TenantModuleRow[] }>("/api/v1/user-management/tenant-modules", {
      method: "PATCH",
      body: JSON.stringify({
        modules: rows().map((r) => ({ module_code: r.module_code, is_enabled: r.is_enabled })),
      }),
    });
    setSaving(false);
    if (res.success && res.data) {
      setRows(res.data.modules);
      await auth.refresh({ background: true });
      toast.success("Modules & features saved.");
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  return (
    <div class="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Module &amp; Features</h1>
        <p class="mt-1 text-sm text-slate-600">
          Enable or disable modules and sub-features for this tenant. Disabled items are hidden from
          the sidebar for all users.
        </p>
      </div>

      <Show when={!loading()} fallback={<LoadingText class="text-sm text-slate-500" as="p" />}>
        <Show when={!isEmpty()} fallback={
          <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No modules loaded. Confirm migration <code class="font-mono text-xs">057_tenant_modules_features.sql</code> has
            been applied, then refresh.
          </p>
        }>
        <For each={grouped()}>
          {(group) => (
            <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </h2>
              <div class="space-y-2">
                <For each={group.items}>
                  {(row) => (
                    <label class="flex cursor-pointer gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        class="mt-1 h-4 w-4"
                        checked={row.is_enabled}
                        disabled={!canManage() || !row.can_toggle}
                        onChange={() => toggle(row.module_code)}
                      />
                      <span>
                        <span class="block text-sm font-medium text-slate-900">
                          {GROUP_LABELS[row.module_code] ?? row.module_name}
                        </span>
                        <span class="block font-mono text-xs text-slate-400">{row.module_code}</span>
                      </span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>

        <Show when={canManage()}>
          <button
            type="button"
            class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={saving()}
            onClick={() => void save()}
          >
            {saving() ? "Saving…" : "Save changes"}
          </button>
        </Show>
        <Show when={!canManage()}>
          <p class="text-xs text-amber-700">Only store admins and owners can change module settings.</p>
        </Show>
        </Show>
      </Show>
    </div>
  );
}
