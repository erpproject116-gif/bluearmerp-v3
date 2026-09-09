import { For } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import {
  jobsHref,
  recipesHref,
  type MfgMode,
  MFG_COPY,
} from "./mfgProductionMode";
import { inferMfgModeFromPath } from "./productionHubMode";

const MODES: MfgMode[] = ["assembly", "disassembly"];

const STEPS = [
  { id: "recipe", short: "1. Recipe" },
  { id: "job", short: "2. Jobs" },
] as const;

function matchStep(id: string, pathname: string, mode: MfgMode): boolean {
  if (id === "recipe") return pathname.startsWith(recipesHref(mode));
  if (id === "job") {
    return (
      pathname.startsWith(jobsHref(mode)) ||
      pathname.startsWith("/app/production/issue-station") ||
      pathname.startsWith("/app/production/receive-station") ||
      pathname.startsWith("/app/production/weigh-parts")
    );
  }
  return false;
}

function modeStepHref(mode: MfgMode, pathname: string): string {
  if (pathname.startsWith(recipesHref(mode)) || pathname.includes("/recipes")) {
    return recipesHref(mode);
  }
  return jobsHref(mode);
}

export function ProductionSequenceStrip(props: { mode?: MfgMode }) {
  const loc = useLocation();
  const mode = () => props.mode ?? inferMfgModeFromPath(loc.pathname, loc.search) ?? "assembly";
  const copy = () => MFG_COPY[mode()];

  return (
    <div class="mb-4 rounded-xl border border-stroke bg-slate-50/80 px-3 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-medium text-text-primary">{copy().branchTitle}</p>
        <nav class="flex items-center gap-1 rounded-lg border border-stroke bg-white p-0.5" aria-label="Production mode">
          <For each={MODES}>
            {(m) => {
              const active = () => mode() === m;
              const href = () => modeStepHref(m, loc.pathname);
              return (
                <A
                  href={href()}
                  class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
                  classList={{
                    "bg-brand-600 text-white": active(),
                    "text-text-secondary hover:text-text-primary": !active(),
                  }}
                  aria-current={active() ? "page" : undefined}
                >
                  {MFG_COPY[m].branchTitle}
                </A>
              );
            }}
          </For>
        </nav>
      </div>
      <p class="mt-0.5 text-[11px] text-text-secondary">{copy().sequenceHint}</p>
      <nav class="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${copy().branchTitle} workflow`}>
        <For each={STEPS}>
          {(step, i) => {
            const active = () => matchStep(step.id, loc.pathname, mode());
            const href = () => (step.id === "recipe" ? recipesHref(mode()) : jobsHref(mode()));
            return (
              <>
                <ShowLink step={step} href={href()} active={active()} />
                {i() < STEPS.length - 1 ? (
                  <span class="text-text-secondary" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </>
            );
          }}
        </For>
      </nav>
    </div>
  );
}

function ShowLink(props: { step: { id: string; short: string }; href: string; active: boolean }) {
  return (
    <A
      href={props.href}
      class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
      classList={{
        "bg-brand-600 text-white": props.active,
        "border border-stroke bg-white text-text-secondary hover:text-text-primary": !props.active,
      }}
      aria-current={props.active ? "step" : undefined}
    >
      {props.step.short}
    </A>
  );
}
