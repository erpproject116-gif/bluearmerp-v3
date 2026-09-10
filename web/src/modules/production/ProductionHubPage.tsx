import { A, useLocation } from "@solidjs/router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { MfgMode } from "./mfgProductionMode";
import { persistLastMfgMode, readLastMfgMode } from "./productionHubMode";
import {
  activeFlowStepIndex,
  isProductionHubPath,
  PRODUCTION_FLOWS,
  type ProductionFlowStep,
} from "./productionWorkflowDiagram";

const MASTERS: { label: string; href: string; sub: string }[] = [
  { label: "Items", href: "/app/inventory/items", sub: "Products & materials" },
  { label: "Locations", href: "/app/inventory/locations", sub: "Warehouses" },
  { label: "Setup", href: "/app/production/setup", sub: "Quality & SO bridge" },
];

function StepPill(props: {
  step: ProductionFlowStep;
  active: boolean;
  youAreHere: boolean;
  onSelect: () => void;
}) {
  const s = () => props.step;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      class="inline-flex min-w-[5.5rem] max-w-[8.5rem] flex-col items-center rounded-xl border px-2 py-1.5 text-center transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      classList={{
        "border-brand-400 bg-brand-50 text-brand-900 ring-2 ring-brand-200": props.youAreHere,
        "border-stroke bg-white text-text-primary hover:border-brand-200 hover:bg-brand-50/80":
          props.active && !props.youAreHere,
        "border-dashed border-stroke/80 bg-slate-50/80 text-text-secondary": !!s().optional && !props.active && !props.youAreHere,
        "border-stroke bg-white text-text-primary": !s().optional && !props.active && !props.youAreHere,
      }}
      aria-current={props.youAreHere ? "step" : undefined}
    >
      <span class="text-[11px] font-semibold leading-tight">{s().label}</span>
      <span class="mt-0.5 text-[10px] leading-tight opacity-80">{s().short}</span>
      <Show when={s().onJobsRow}>
        <span class="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-text-secondary/90">on Jobs list</span>
      </Show>
    </button>
  );
}

function FlowDiagram(props: { mode: MfgMode }) {
  const loc = useLocation();
  const flow = () => PRODUCTION_FLOWS[props.mode];
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const routeStepIndex = createMemo(() => {
    if (isProductionHubPath(loc.pathname)) return -1;
    return activeFlowStepIndex(loc.pathname, loc.search, flow());
  });

  const selectedStep = createMemo((): ProductionFlowStep | null => {
    const id = selectedId();
    if (id) return flow().steps.find((s) => s.id === id) ?? null;
    const idx = routeStepIndex();
    if (idx >= 0) return flow().steps[idx];
    return flow().steps[0];
  });

  const isYouAreHere = (index: number) => !selectedId() && routeStepIndex() === index;

  return (
    <div>
      <p class="mb-0.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">{flow().title}</p>
      <p class="mb-3 text-[11px] leading-snug text-text-secondary">{flow().tagline}</p>

      <div class="flex flex-wrap items-center gap-1.5">
        <For each={flow().steps}>
          {(step, i) => (
            <>
              <Show when={i() > 0}>
                <span class="px-0.5 text-text-secondary/50" aria-hidden="true">
                  →
                </span>
              </Show>
              <StepPill
                step={step}
                active={selectedStep()?.id === step.id}
                youAreHere={isYouAreHere(i())}
                onSelect={() => setSelectedId(step.id)}
              />
            </>
          )}
        </For>
      </div>

      <Show when={selectedStep()}>
        {(step) => (
          <div class="mt-4 rounded-lg border border-stroke bg-slate-50/90 px-3 py-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-text-primary">{step().label}</p>
                <p class="mt-0.5 text-xs text-text-secondary">{step().description}</p>
              </div>
              <A
                href={step().href}
                class="shrink-0 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-50"
              >
                Open →
              </A>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-text-secondary">{step().detail}</p>
            <Show when={step().optional}>
              <p class="mt-2 text-[10px] font-medium text-text-secondary">Optional — skip when not applicable.</p>
            </Show>
            <Show when={step().onJobsRow}>
              <p class="mt-2 text-[10px] font-medium text-text-secondary">
                This action lives on the Jobs list row (Next: …), not a separate menu item.
              </p>
            </Show>
          </div>
        )}
      </Show>

      <Show when={routeStepIndex() >= 0 && !isProductionHubPath(loc.pathname)}>
        <p class="mt-3 text-[11px] text-brand-800">
          <span class="font-semibold">You are here:</span> {flow().steps[routeStepIndex()]?.label}
        </p>
      </Show>
    </div>
  );
}

function setHubMode(mode: MfgMode, setter: (m: MfgMode) => void) {
  setter(mode);
  persistLastMfgMode(mode);
}

export function ProductionHubPage() {
  const [mode, setMode] = createSignal<MfgMode>("assembly");

  onMount(() => setMode(readLastMfgMode()));

  return (
    <div class="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header>
        <h1 class="text-lg font-semibold text-text-primary">Production</h1>
        <p class="mt-1 max-w-3xl text-sm text-text-secondary">
          Map where you are from sales demand through finished goods. Click any step for what to do next, then use{" "}
          <span class="font-medium text-text-primary">Open</span> to go there. Release, QC, and Complete are row actions
          on the Jobs list.
        </p>
      </header>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
          classList={{
            "border-brand-400 bg-brand-50 text-brand-900": mode() === "assembly",
            "border-stroke bg-white text-text-secondary hover:border-stroke/80": mode() !== "assembly",
          }}
          onClick={() => setHubMode("assembly", setMode)}
        >
          Assembly
        </button>
        <button
          type="button"
          class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
          classList={{
            "border-brand-400 bg-brand-50 text-brand-900": mode() === "disassembly",
            "border-stroke bg-white text-text-secondary hover:border-stroke/80": mode() !== "disassembly",
          }}
          onClick={() => setHubMode("disassembly", setMode)}
        >
          Disassembly
        </button>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <FlowDiagram mode={mode()} />
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Before you start</p>
        <div class="flex flex-wrap gap-2">
          <For each={MASTERS}>
            {(m) => (
              <A
                href={m.href}
                class="inline-flex min-w-[5rem] flex-col items-center rounded-xl border border-stroke bg-white px-2.5 py-1.5 text-center transition hover:border-brand-200 hover:bg-brand-50"
              >
                <span class="text-xs font-semibold">{m.label}</span>
                <span class="mt-0.5 text-[10px] text-text-secondary">{m.sub}</span>
              </A>
            )}
          </For>
        </div>
      </section>

      <section class="rounded-xl border border-dashed border-stroke bg-slate-50/80 p-4">
        <h2 class="text-sm font-semibold text-text-primary">What this covers (and what it does not)</h2>
        <div class="mt-2 grid gap-4 md:grid-cols-2">
          <div>
            <p class="text-xs font-semibold text-text-primary">In scope today</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-text-secondary">
              <li>Assembly & disassembly recipes (what you build or take apart)</li>
              <li>Jobs: Start → take stock if needed → record results → Finish</li>
              <li>Optional link to a sales order; serial/lot steps only when tracking is on</li>
              <li>Record parts on take-apart jobs; stock updates when you Finish</li>
              <li>Reports and setup (quality check policy, sales-order bridge)</li>
            </ul>
          </div>
          <div>
            <p class="text-xs font-semibold text-text-primary">Outside Production menu</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-text-secondary">
              <li>Full Quality module (NCR, CAPA, supplier quality) — separate from job quality check</li>
              <li>In-process manufacturing QC (planned; not a full floor station yet)</li>
              <li>Multi-level BOM explosion (single-level recipes per job today)</li>
              <li>MRP, capacity planning, shop-floor scheduling beyond job status</li>
            </ul>
          </div>
        </div>
      </section>

      <div class="flex flex-wrap gap-2 text-xs">
        <A href="/app/production/assembly/jobs" class="font-medium text-brand-700 hover:underline">
          Assembly jobs →
        </A>
        <A href="/app/production/disassembly/jobs" class="font-medium text-brand-700 hover:underline">
          Disassembly jobs →
        </A>
        <A href="/app/production/reports" class="font-medium text-brand-700 hover:underline">
          Reports →
        </A>
      </div>
    </div>
  );
}
