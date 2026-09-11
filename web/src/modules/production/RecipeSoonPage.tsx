import { A } from "@solidjs/router";
import { newAssemblyOrderHref } from "./mfgProductionMode";

/** Phase 3 placeholder — Recipe / Processing type card target. */
export function RecipeSoonPage() {
  return (
    <div class="mx-auto max-w-lg space-y-4 rounded-xl border border-orange-200 bg-orange-50/50 p-6">
      <h1 class="text-xl font-semibold text-text-primary">Recipe / Processing</h1>
      <p class="text-sm text-text-secondary">
        Coming soon (Phase 3). For now, use <strong>Assembly</strong> for multi-component builds, or{" "}
        <strong>Cutting / Breakdown</strong> for one-to-many breakdowns.
      </p>
      <div class="flex flex-wrap gap-2">
        <A
          href={newAssemblyOrderHref()}
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          New Assembly order
        </A>
        <A href="/app/production/disassembly/jobs" class="rounded-lg border border-stroke bg-white px-3 py-2 text-sm hover:bg-slate-50">
          Cutting jobs
        </A>
        <A href="/app/production" class="rounded-lg border border-stroke bg-white px-3 py-2 text-sm hover:bg-slate-50">
          Dashboard
        </A>
      </div>
    </div>
  );
}
