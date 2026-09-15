import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { useToast } from "./toast";
import { MODULE_SETUP_SCOPES } from "./moduleSetupScopes";
import { PROCESS_POLICY_FIELD_META } from "./processPolicyFieldMeta";
import { processPolicyQueryKey } from "./useProcessPolicy";
import { getActiveTenantId } from "./activeContext";
import { useAuth } from "./auth-context";

type ProcessPolicy = {
  tenant_id: number;
  budget_control_mode: string;
  [key: string]: boolean | number | string;
};

type Props = {
  /** MODULE_SETUP_SCOPES id */
  scopeId: string;
  title?: string;
  /** Compact card for embedding under Form settings */
  compact?: boolean;
};

/**
 * Editable process-policy toggles scoped to a module (same data as Process Policies).
 * Used on module Setup hubs and Form settings pages.
 */
export function ProcessRulesPanel(props: Props) {
  const toast = useToast();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [policy, setPolicy] = createSignal<ProcessPolicy | null>(null);

  const scope = () => MODULE_SETUP_SCOPES[props.scopeId] ?? null;
  const tenantId = () => auth.me?.tenant.id ?? getActiveTenantId() ?? 0;

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
      toast.error(res.message || "Failed to load process rules.");
    }
  };

  createEffect(() => {
    props.scopeId;
    void load();
  });

  const toggle = (key: string) => {
    const p = policy();
    if (!p || !canManage()) return;
    setPolicy({ ...p, [key]: !p[key] });
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
    const res = await apiFetch<ProcessPolicy>("/api/v1/settings/process-policies", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.success && res.data) {
      setPolicy(res.data);
      const tid = tenantId();
      if (tid > 0) {
        void queryClient.invalidateQueries({ queryKey: processPolicyQueryKey(tid) });
      }
      toast.success("Process rules saved.");
    } else {
      toast.error(res.message || "Failed to save process rules.");
    }
  };

  return (
    <Show when={scope()}>
      {(sc) => (
        <section
          class={
            props.compact
              ? "space-y-3 rounded-xl border border-stroke bg-white p-4 shadow-sm"
              : "space-y-3 rounded-xl border border-stroke bg-white p-4 shadow-sm"
          }
        >
          <div>
            <h2 class="text-sm font-semibold text-text-primary">
              {props.title ?? sc().title}
            </h2>
            <p class="mt-1 text-xs text-text-secondary">
              Includes attachment requirements and flow gates. Same rules as Process Policies —
              edit them here so you do not have to leave this module.
            </p>
          </div>

          <Show when={loading()}>
            <p class="text-sm text-text-secondary">Loading…</p>
          </Show>

          <Show when={!loading() && policy()}>
            <ul class="divide-y divide-stroke/60">
              <For each={sc().policyKeys}>
                {(key) => {
                  const meta = PROCESS_POLICY_FIELD_META[key] ?? { label: key, help: "" };
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

            <div class="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={!canManage() || saving()}
                onClick={() => void save()}
              >
                {saving() ? "Saving…" : "Save process rules"}
              </button>
              <Show when={!canManage()}>
                <span class="text-xs text-text-secondary">Ask an administrator to change these rules.</span>
              </Show>
              <A
                href="/app/user-management/process-policies"
                class="text-xs text-text-secondary hover:underline"
              >
                View all process policies
              </A>
            </div>
          </Show>
        </section>
      )}
    </Show>
  );
}
