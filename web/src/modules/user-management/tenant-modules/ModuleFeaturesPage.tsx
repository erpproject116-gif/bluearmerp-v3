import { uiLabel } from "../../../shared/branding/uiLabel";
import { createEffect, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { useAuth } from "../../../shared/auth-context";
import type { TenantModuleRow } from "../../../shared/moduleAccess";
import { useToast } from "../../../shared/toast";

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Business Dashboard",
  inventory: "Inventory",
  "inventory.serial_lot": "Serial & Lot",
  "inventory.wms": "WMS",
  "inventory.price_lists": "Price List",
  after_sales: "After-Sales",
  quotation: "Quotation",
  "quotation.tax_mngt": "Tax Management",
  sales: "Sales",
  "sales.collective_invoicing": "Collective Invoicing (Sales)",
  sales_order: "Sales Order",
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
  purchases: "Purchases",
  crm: "CRM",
  finance: "Accounting overview",
  "finance.acct_i": "Accounting I",
  "finance.acct_ii": "Accounting II",
  "finance.payment_vouchers": "AP Review / Payment Vouchers",
  activity_logs: "Activity Logs",
  operations: "Project Management",
  documentation: "Help & guides",
  user_management: "User Management",
  pos: "Point of Sale",
};

type PreviewResult = {
  modules_delta: { module_code: string; is_enabled: boolean }[];
  policy_delta: { field: string; value: boolean; message: string }[];
  messages: string[];
  preset?: string;
};

function groupFor(row: TenantModuleRow): string {
  if (row.module_type === "feature" && row.parent_module) {
    if (row.parent_module === "inventory") return "Stocks Management";
    if (row.parent_module === "quotation" || row.parent_module === "sales" || row.parent_module === "sales_order") {
      return "Sales Process";
    }
    if (row.parent_module === "finance") return "CRM & Finance";
  }
  if (row.module_code === "inventory" || row.module_code === "after_sales") return "Stocks Management";
  if (
    row.module_code === "quotation" ||
    row.module_code === "sales" ||
    row.module_code === "sales_order" ||
    row.module_code === "pos"
  ) {
    return "Sales Process";
  }
  if (row.module_code === "purchase_request" || row.module_code === "purchase_order" || row.module_code === "purchases") {
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
  const [mode, setMode] = createSignal<"simple_store" | "full_process" | "customize">("customize");
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [preview, setPreview] = createSignal<PreviewResult | null>(null);

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
    setMode("customize");
    setRows((prev) => {
      const current = prev.find((r) => r.module_code === code);
      if (!current) return prev;
      const nextOn = !current.is_enabled;
      return prev.map((r) => {
        if (r.module_code === code) return { ...r, is_enabled: nextOn };
        // Turning a parent on also turns its feature children on in the draft.
        // Turning a parent off is enforced by API cascade on save.
        if (nextOn && r.module_type === "feature" && r.depends_on?.includes(code)) {
          return { ...r, is_enabled: true };
        }
        return r;
      });
    });
  };

  const applyPresetLocally = (preset: "simple_store" | "full_process") => {
    setMode(preset);
    const flags =
      preset === "simple_store"
        ? {
            quotation: false,
            sales_order: false,
            purchase_request: false,
            sales: true,
            pos: true,
            inventory: true,
            purchases: true,
            purchase_order: true,
          }
        : {
            quotation: true,
            sales_order: true,
            purchase_request: true,
            sales: true,
            purchases: true,
            purchase_order: true,
          };
    setRows((prev) =>
      prev.map((r) => {
        const next = flags[r.module_code as keyof typeof flags];
        return next === undefined ? r : { ...r, is_enabled: next };
      }),
    );
  };

  const openConfirm = async () => {
    if (!canManage()) return;
    setSaving(true);
    const res = await apiFetch<PreviewResult>("/api/v1/user-management/tenant-modules/preview", {
      method: "POST",
      body: JSON.stringify({
        modules: rows().map((r) => ({ module_code: r.module_code, is_enabled: r.is_enabled })),
        apply_policy_sync: true,
        preset: mode() === "customize" ? "" : mode(),
      }),
    });
    setSaving(false);
    if (res.success && res.data) {
      setPreview(res.data);
      setConfirmOpen(true);
    } else {
      toast.error(res.message || "Failed to preview changes.");
    }
  };

  const confirmSave = async () => {
    if (!canManage()) return;
    setSaving(true);
    const res = await apiFetch<{ modules: TenantModuleRow[] }>("/api/v1/user-management/tenant-modules", {
      method: "PATCH",
      body: JSON.stringify({
        modules: rows().map((r) => ({ module_code: r.module_code, is_enabled: r.is_enabled })),
        apply_policy_sync: true,
        preset: mode() === "customize" ? "" : mode(),
      }),
    });
    setSaving(false);
    setConfirmOpen(false);
    if (res.success && res.data) {
      setRows(res.data.modules);
      await auth.refresh({ background: true });
      toast.success("Modules & features saved. Process rules updated where needed.");
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  return (
    <div class="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Module &amp; Features</h1>
        <p class="mt-1 text-sm text-slate-600">
          Hidden from menus and blocked for new documents. Process rules that required a hidden step are updated when
          you save. Prefer a preset if you are not sure which checkboxes to change.
        </p>
      </div>

      <Show when={canManage()}>
        <div class="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            class="rounded-xl border p-4 text-left shadow-sm transition"
            classList={{
              "border-brand-500 bg-brand-50": mode() === "simple_store",
              "border-slate-200 bg-white hover:border-slate-300": mode() !== "simple_store",
            }}
            onClick={() => applyPresetLocally("simple_store")}
          >
            <p class="text-sm font-semibold text-slate-900">Simple store</p>
            <p class="mt-1 text-xs text-slate-600">Hide Quotation &amp; Sales Order. Direct sales invoices. PR optional.</p>
          </button>
          <button
            type="button"
            class="rounded-xl border p-4 text-left shadow-sm transition"
            classList={{
              "border-brand-500 bg-brand-50": mode() === "full_process",
              "border-slate-200 bg-white hover:border-slate-300": mode() !== "full_process",
            }}
            onClick={() => applyPresetLocally("full_process")}
          >
            <p class="text-sm font-semibold text-slate-900">Full process</p>
            <p class="mt-1 text-xs text-slate-600">Quote → order → deliver → invoice. PR and GR gates on.</p>
          </button>
          <button
            type="button"
            class="rounded-xl border p-4 text-left shadow-sm transition"
            classList={{
              "border-brand-500 bg-brand-50": mode() === "customize",
              "border-slate-200 bg-white hover:border-slate-300": mode() !== "customize",
            }}
            onClick={() => setMode("customize")}
          >
            <p class="text-sm font-semibold text-slate-900">Customize</p>
            <p class="mt-1 text-xs text-slate-600">Toggle modules below. Save still syncs process rules safely.</p>
          </button>
        </div>
      </Show>

      <Show when={!loading()} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <Show
          when={!isEmpty()}
          fallback={
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No modules loaded. Confirm migrations <code class="font-mono text-xs">057</code> and{" "}
              <code class="font-mono text-xs">187</code> have been applied, then refresh.
            </p>
          }
        >
          <For each={grouped()}>
            {(group) => (
              <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{group.label}</h2>
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
              onClick={() => void openConfirm()}
            >
              {saving() ? "Checking…" : "Review & save"}
            </button>
          </Show>
          <Show when={!canManage()}>
            <p class="text-xs text-amber-700">Only store admins and owners can change module settings.</p>
          </Show>
        </Show>
      </Show>

      <Show when={confirmOpen() && preview()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div class="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 class="text-lg font-semibold text-slate-900">Confirm changes</h2>
            <p class="mt-1 text-sm text-slate-600">
              Saving will update modules and process rules so hidden steps are not required.
            </p>
            <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
              <For each={preview()!.messages.length ? preview()!.messages : ["No process-rule changes."]}>
                {(msg) => <li>{msg}</li>}
              </For>
            </ul>
            <Show when={preview()!.modules_delta.length > 0}>
              <p class="mt-3 text-xs font-semibold uppercase text-slate-500">Modules</p>
              <ul class="mt-1 space-y-1 text-xs text-slate-700">
                <For each={preview()!.modules_delta}>
                  {(d) => (
                    <li>
                      <code class="font-mono">{d.module_code}</code> → {d.is_enabled ? "On" : "Off"}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={saving()}
                onClick={() => void confirmSave()}
              >
                {saving() ? "Saving…" : "Confirm save"}
              </button>
              <button
                type="button"
                class="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <A href="/app/user-management/process-policies" class="ml-auto self-center text-xs text-brand-600 hover:underline">
                View process policies
              </A>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
