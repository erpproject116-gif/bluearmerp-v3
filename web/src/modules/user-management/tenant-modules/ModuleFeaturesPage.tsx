import { uiLabel } from "../../../shared/branding/uiLabel";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { useAuth } from "../../../shared/auth-context";
import type { TenantModuleRow } from "../../../shared/moduleAccess";
import { PROCESS_POLICY_FIELD_META } from "../../../shared/processPolicyFieldMeta";
import { useToast } from "../../../shared/toast";
import type { ProcessPolicy } from "../../../shared/useProcessPolicy";
import {
  applyModuleToggle,
  applyPresetToRows,
  boolLabel,
  catalogNodes,
  filterRows,
  groupRows,
  moduleBlurb,
  moduleDisplayName,
  type PresetId,
} from "./tenantModulesDraft";

type PreviewResult = {
  modules_delta: { module_code: string; is_enabled: boolean }[];
  policy_delta: { field: string; value: boolean; message: string }[];
  messages: string[];
  preset?: string;
};

type ViewMode = "catalog" | "classic";

function policyFieldLabel(field: string): string {
  return PROCESS_POLICY_FIELD_META[field]?.label ?? field;
}

function policyCurrentValue(policy: ProcessPolicy | null, field: string): boolean | null {
  if (!policy) return null;
  const v = (policy as unknown as Record<string, unknown>)[field];
  return typeof v === "boolean" ? v : null;
}

export default function ModuleFeaturesPage() {
  const toast = useToast();
  const auth = useAuth();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [rows, setRows] = createSignal<TenantModuleRow[]>([]);
  const [baseline, setBaseline] = createSignal<TenantModuleRow[]>([]);
  const [mode, setMode] = createSignal<"simple_store" | "full_process" | "customize">("customize");
  const [view, setView] = createSignal<ViewMode>("catalog");
  const [query, setQuery] = createSignal("");
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [preview, setPreview] = createSignal<PreviewResult | null>(null);
  const [policySnapshot, setPolicySnapshot] = createSignal<ProcessPolicy | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ modules: TenantModuleRow[]; can_manage: boolean }>(
      "/api/v1/user-management/tenant-modules",
    );
    setLoading(false);
    if (res.success && res.data) {
      const list = res.data.modules ?? [];
      setRows(list);
      setBaseline(list.map((r) => ({ ...r })));
      setCanManage(!!res.data.can_manage);
    } else {
      toast.error(res.message || "Failed to load modules.");
    }
  };

  createEffect(() => {
    void load();
  });

  const visibleRows = createMemo(() => filterRows(rows(), query()));
  const grouped = createMemo(() => groupRows(visibleRows()));
  const isEmpty = () => !loading() && rows().length === 0;

  const baselineEnabled = (code: string): boolean | null => {
    const row = baseline().find((r) => r.module_code === code);
    return row ? row.is_enabled : null;
  };

  const toggle = (code: string) => {
    if (!canManage()) return;
    setMode("customize");
    const result = applyModuleToggle(rows(), code);
    if (!result.ok) {
      const names = result.missingDeps.map((r) => moduleDisplayName(r)).join(", ");
      toast.warning(`Turn on ${names} first. This app depends on ${result.missingDeps.length === 1 ? "that app" : "those apps"}.`);
      return;
    }
    setRows(result.rows);
    if (!result.turnedOn) {
      const bits: string[] = [];
      if (result.cascadedFeatures.length) {
        bits.push(
          `also turned off: ${result.cascadedFeatures.map((r) => moduleDisplayName(r)).join(", ")}`,
        );
      }
      if (result.dependentsStillOn.length) {
        bits.push(
          `still on and may need this app: ${result.dependentsStillOn.map((r) => moduleDisplayName(r)).join(", ")}`,
        );
      }
      if (bits.length) toast.warning(`Turned off. ${bits.join(" · ")}`);
    }
  };

  const applyPresetLocally = (preset: PresetId) => {
    setMode(preset);
    setRows((prev) => applyPresetToRows(prev, preset));
  };

  const openConfirm = async () => {
    if (!canManage()) return;
    setSaving(true);
    const [prevRes, polRes] = await Promise.all([
      apiFetch<PreviewResult>("/api/v1/user-management/tenant-modules/preview", {
        method: "POST",
        body: JSON.stringify({
          modules: rows().map((r) => ({ module_code: r.module_code, is_enabled: r.is_enabled })),
          apply_policy_sync: true,
          preset: mode() === "customize" ? "" : mode(),
        }),
      }),
      apiFetch<ProcessPolicy>("/api/v1/settings/process-policies"),
    ]);
    setSaving(false);
    if (prevRes.success && prevRes.data) {
      setPreview(prevRes.data);
      setPolicySnapshot(polRes.success && polRes.data ? polRes.data : null);
      setConfirmOpen(true);
    } else {
      toast.error(prevRes.message || "Failed to preview changes.");
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
      const list = res.data.modules;
      setRows(list);
      setBaseline(list.map((r) => ({ ...r })));
      await auth.refresh({ background: true });
      toast.success("Apps updated. Process rules synced where needed. Historical data was kept.");
    } else {
      toast.error(res.message || "Failed to save.");
    }
  };

  const depLabels = (row: TenantModuleRow) =>
    (row.depends_on ?? [])
      .map((code) => {
        const dep = rows().find((r) => r.module_code === code);
        return dep ? moduleDisplayName(dep) : code;
      })
      .filter(Boolean);

  return (
    <div class="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Apps &amp; features</h1>
        <p class="mt-1 text-sm text-slate-600">
          Turn capabilities on or off for this company. Menus update and new work in turned-off apps is blocked.
          Prefer a starter pack if you are not sure what to change.
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
            <p class="mt-1 text-xs text-slate-600">
              Inventory, POS, Purchase Order, and Purchases. Quotation, Sales Order, and Purchase Request stay off.
              <span class="mt-1 block font-medium text-slate-700">
                Sales stays on as the billing engine POS and books need — not the full quote→order chain.
              </span>
            </p>
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
            <p class="mt-1 text-xs text-slate-600">
              Quote → order → deliver → invoice. Purchase request and goods-receipt gates on.
            </p>
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
            <p class="mt-1 text-xs text-slate-600">
              Turn apps on or off below. Review &amp; save still syncs process rules safely.
            </p>
          </button>
        </div>
      </Show>

      <div class="flex flex-wrap items-center gap-3">
        <div class="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 font-medium"
            classList={{
              "bg-slate-900 text-white": view() === "catalog",
              "text-slate-600 hover:bg-slate-50": view() !== "catalog",
            }}
            onClick={() => setView("catalog")}
          >
            Catalog
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 font-medium"
            classList={{
              "bg-slate-900 text-white": view() === "classic",
              "text-slate-600 hover:bg-slate-50": view() !== "classic",
            }}
            onClick={() => setView("classic")}
          >
            Classic list
          </button>
        </div>
        <input
          type="search"
          class="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Search apps…"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

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
          <Show when={view() === "catalog"}>
            <For each={grouped()}>
              {(group) => (
                <section class="space-y-3">
                  <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.label}</h2>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <For each={catalogNodes(group.items)}>
                      {(node) => (
                        <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-sm font-semibold text-slate-900">
                                  {moduleDisplayName(node.parent)}
                                </h3>
                                <span
                                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                  classList={{
                                    "bg-emerald-50 text-emerald-800": node.parent.is_enabled,
                                    "bg-slate-100 text-slate-600": !node.parent.is_enabled,
                                  }}
                                >
                                  {node.parent.is_enabled ? "On" : "Off"}
                                </span>
                              </div>
                              <p class="mt-1 text-xs text-slate-600">{moduleBlurb(node.parent.module_code)}</p>
                              <Show when={depLabels(node.parent).length > 0}>
                                <p class="mt-1 text-[11px] text-slate-500">
                                  Requires: {depLabels(node.parent).join(", ")}
                                </p>
                              </Show>
                            </div>
                            <Show when={canManage() && node.parent.can_toggle}>
                              <button
                                type="button"
                                class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium"
                                classList={{
                                  "border-slate-300 text-slate-700 hover:bg-slate-50": node.parent.is_enabled,
                                  "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100":
                                    !node.parent.is_enabled,
                                }}
                                onClick={() => toggle(node.parent.module_code)}
                              >
                                {node.parent.is_enabled ? "Turn off" : "Turn on"}
                              </button>
                            </Show>
                          </div>
                          <Show when={node.features.length > 0}>
                            <ul class="mt-3 space-y-2 border-t border-slate-100 pt-3">
                              <For each={node.features}>
                                {(feat) => (
                                  <li class="flex items-start justify-between gap-2">
                                    <div class="min-w-0">
                                      <p class="text-xs font-medium text-slate-800">{moduleDisplayName(feat)}</p>
                                      <p class="text-[11px] text-slate-500">{moduleBlurb(feat.module_code)}</p>
                                    </div>
                                    <Show when={canManage() && feat.can_toggle}>
                                      <button
                                        type="button"
                                        class="shrink-0 rounded border px-2 py-1 text-[11px] font-medium"
                                        classList={{
                                          "border-slate-300 text-slate-600": feat.is_enabled,
                                          "border-brand-300 text-brand-700": !feat.is_enabled,
                                        }}
                                        disabled={!node.parent.is_enabled && !feat.is_enabled}
                                        title={
                                          !node.parent.is_enabled && !feat.is_enabled
                                            ? "Turn on the parent app first"
                                            : undefined
                                        }
                                        onClick={() => toggle(feat.module_code)}
                                      >
                                        {feat.is_enabled ? "Turn off" : "Turn on"}
                                      </button>
                                    </Show>
                                    <Show when={!canManage() || !feat.can_toggle}>
                                      <span class="text-[11px] text-slate-400">{boolLabel(feat.is_enabled)}</span>
                                    </Show>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </Show>
                        </article>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </Show>

          <Show when={view() === "classic"}>
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
                            <span class="block text-sm font-medium text-slate-900">{moduleDisplayName(row)}</span>
                            <span class="block text-xs text-slate-500">{moduleBlurb(row.module_code)}</span>
                            <span class="block font-mono text-[10px] text-slate-400">{row.module_code}</span>
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>

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
            <p class="text-xs text-amber-700">Only store admins and owners can change app settings.</p>
          </Show>
        </Show>
      </Show>

      <p class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Changes apply to the <span class="font-medium text-slate-800">entire company</span>, not a single branch.
        Turning an app off hides it and blocks new work; <span class="font-medium text-slate-800">historical data
        is kept</span> and is available again if you turn the app back on.
      </p>

      <Show when={confirmOpen() && preview()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div class="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <h2 class="text-lg font-semibold text-slate-900">Confirm changes</h2>
            <p class="mt-1 text-sm text-slate-600">
              Saving updates which apps are on and may adjust process rules so hidden steps are not required. Data is
              not deleted.
            </p>
            <Show when={mode() === "simple_store" || mode() === "full_process"}>
              <p class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You are applying the <span class="font-semibold">{mode() === "simple_store" ? "Simple store" : "Full process"}</span>{" "}
                pack. Review process-rule changes below carefully.
              </p>
            </Show>
            <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-800">
              <For each={preview()!.messages.length ? preview()!.messages : ["No narrative process-rule notes."]}>
                {(msg) => <li>{msg}</li>}
              </For>
            </ul>
            <Show when={preview()!.modules_delta.length > 0}>
              <p class="mt-3 text-xs font-semibold uppercase text-slate-500">Apps</p>
              <ul class="mt-1 space-y-1 text-xs text-slate-700">
                <For each={preview()!.modules_delta}>
                  {(d) => {
                    const before = baselineEnabled(d.module_code);
                    const row = rows().find((r) => r.module_code === d.module_code);
                    const label = row
                      ? moduleDisplayName(row)
                      : moduleDisplayName({ module_code: d.module_code, module_name: d.module_code });
                    return (
                      <li>
                        <span class="font-medium">{label}</span>{" "}
                        <code class="font-mono text-[10px] text-slate-400">{d.module_code}</code>:{" "}
                        {before == null ? "—" : boolLabel(before)} → {boolLabel(d.is_enabled)}
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
            <Show when={preview()!.policy_delta.length > 0}>
              <p class="mt-3 text-xs font-semibold uppercase text-slate-500">Process rules (before → after)</p>
              <ul class="mt-1 space-y-1 text-xs text-slate-700">
                <For each={preview()!.policy_delta}>
                  {(d) => {
                    const before = policyCurrentValue(policySnapshot(), d.field);
                    return (
                      <li>
                        <span class="font-medium">{policyFieldLabel(d.field)}</span>{" "}
                        <code class="font-mono text-[10px] text-slate-400">{d.field}</code>:{" "}
                        {before == null ? "—" : boolLabel(before)} → {boolLabel(d.value)}
                        <Show when={d.message}>
                          <span class="mt-0.5 block text-slate-500">{d.message}</span>
                        </Show>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
            <Show when={preview()!.policy_delta.length === 0}>
              <p class="mt-3 text-xs text-slate-500">No process-rule field changes in this preview.</p>
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
              <A
                href="/app/user-management/process-policies"
                class="ml-auto self-center text-xs text-brand-600 hover:underline"
              >
                View process policies
              </A>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
