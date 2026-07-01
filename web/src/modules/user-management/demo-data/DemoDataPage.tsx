import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";

type DemoStatus = {
  eligible: boolean;
  company_code: string;
  is_demo_tenant: boolean;
  can_manage: boolean;
  scripts_available: boolean;
  checks: Record<string, boolean>;
  counts: Record<string, number>;
};

type StepResult = {
  script: string;
  ok: boolean;
  message?: string;
  elapsed?: string;
};

export default function DemoDataPage() {
  const toast = useToast();
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal<"purge" | "populate" | null>(null);
  const [status, setStatus] = createSignal<DemoStatus | null>(null);
  const [steps, setSteps] = createSignal<StepResult[]>([]);
  const [purgeFirst, setPurgeFirst] = createSignal(true);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<DemoStatus>("/api/v1/settings/demo-data");
    setLoading(false);
    if (res.success && res.data) {
      setStatus(res.data);
    } else {
      toast.error(res.message ?? "Could not load demo data status.");
    }
  };

  createEffect(() => {
    void load();
  });

  const runPurge = async () => {
    if (!confirm("Remove all demo transactional data for DEMO000 and BLUEARM? Master inventory (partners, items, locations) is kept.")) {
      return;
    }
    setBusy("purge");
    setSteps([]);
    const res = await apiFetch<{ steps: StepResult[]; status: DemoStatus }>("/api/v1/settings/demo-data/purge", {
      method: "POST",
    });
    setBusy(null);
    if (res.success && res.data) {
      setSteps(res.data.steps);
      setStatus(res.data.status);
      toast.success(res.message ?? "Demo data purged.");
    } else {
      toast.error(res.message ?? "Purge failed.");
    }
  };

  const runPopulate = async () => {
    const msg = purgeFirst()
      ? "Purge demo data, then load the full demo chain (quotations through golden scenarios)? This may take a minute."
      : "Load demo data on top of existing records (idempotent seeds)? This may take a minute.";
    if (!confirm(msg)) return;

    setBusy("populate");
    setSteps([]);
    const res = await apiFetch<{ steps: StepResult[]; status: DemoStatus }>("/api/v1/settings/demo-data/populate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge_first: purgeFirst(), include_verify: true }),
    });
    setBusy(null);
    if (res.success && res.data) {
      setSteps(res.data.steps);
      setStatus(res.data.status);
      toast.success(res.message ?? "Demo data populated.");
    } else {
      toast.error(res.message ?? "Populate failed.");
      if (res.data && "steps" in (res.data as object)) {
        setSteps((res.data as { steps: StepResult[] }).steps);
      }
    }
  };

  const checkLabel: Record<string, string> = {
    golden_s2_pr: "Golden S2 (PR→PO→GR→SO→SI)",
    golden_s9_dr: "Golden S9 (SO→DR→SI)",
    golden_s8_ap: "Golden S8 (supplier invoice + payment)",
    open_po_demogr902: "Open PO receive demo (DEMOGR902)",
    golden_s11_standalone_po: "Golden S11 (standalone PO, no PR)",
    reconciliation_clean: "Reconciliation gaps (should be 0)",
  };

  return (
    <div class="max-w-3xl space-y-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Demo data</h1>
        <p class="mt-1 text-sm text-slate-600">
          Populate or purge sample documents for training and QA. Available on{" "}
          <strong>DEMO000</strong> and <strong>BLUEARM</strong> tenants only. Actions affect both demo tenants
          because seeds are shared.
        </p>
      </div>

      <Show when={!loading()} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <Show
          when={status()?.can_manage}
          fallback={
            <p class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You need store admin access to manage demo data.
            </p>
          }
        >
          <Show
            when={status()?.is_demo_tenant}
            fallback={
              <p class="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Demo data tools are only enabled for demo tenants. Your company code is{" "}
                <strong>{status()?.company_code ?? "—"}</strong>.
              </p>
            }
          >
            <Show
              when={status()?.scripts_available !== false}
              fallback={
                <p class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Demo SQL scripts are not available on this API server. Set{" "}
                  <code class="text-xs">BLUEARM_DEMO_SQL_DIR</code> or redeploy with embedded scripts.
                </p>
              }
            >
              <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    disabled={busy() !== null}
                    onClick={runPopulate}
                  >
                    {busy() === "populate" ? "Populating…" : "Populate demo data"}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={busy() !== null}
                    onClick={runPurge}
                  >
                    {busy() === "purge" ? "Purging…" : "Purge demo data"}
                  </button>
                </div>

                <label class="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={purgeFirst()}
                    onChange={(e) => setPurgeFirst(e.currentTarget.checked)}
                  />
                  Purge before populate (recommended for a clean start)
                </label>

                <p class="text-xs text-slate-500">
                  Populate runs inventory baseline, quotations, purchase/sales chains, golden scenarios S2–S10,
                  finance AP, CRM fixtures, dashboard red flags, then verifies the full chain.
                </p>
              </div>
            </Show>
          </Show>
        </Show>

        <Show when={status()}>
          {(s) => (
            <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h2 class="text-sm font-semibold text-slate-800">Status — {s().company_code}</h2>
              <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <For each={Object.entries(s().counts ?? {})}>
                  {([key, n]) => (
                    <div class="rounded bg-slate-50 px-2 py-1">
                      <span class="text-slate-500">{key.replace(/_/g, " ")}:</span>{" "}
                      <strong>{n}</strong>
                    </div>
                  )}
                </For>
              </div>
              <ul class="space-y-1 text-sm">
                <For each={Object.entries(s().checks ?? {})}>
                  {([key, ok]) => (
                    <li class={ok ? "text-emerald-700" : "text-slate-500"}>
                      {ok ? "✓" : "○"} {checkLabel[key] ?? key}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </Show>

        <Show when={steps().length > 0}>
          <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 class="text-sm font-semibold text-slate-800 mb-2">Last run</h2>
            <ul class="space-y-1 text-xs font-mono">
              <For each={steps()}>
                {(step) => (
                  <li class={step.ok ? "text-emerald-700" : "text-red-700"}>
                    {step.ok ? "OK" : "FAIL"} {step.script}
                    {step.elapsed ? ` (${step.elapsed})` : ""}
                    {step.message ? ` — ${step.message}` : ""}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </Show>
    </div>
  );
}
