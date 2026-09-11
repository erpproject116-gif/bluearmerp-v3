import { Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { jobsHref, recipesHref, type MfgMode, MFG_COPY } from "./mfgProductionMode";
import { inferMfgModeFromPath } from "./productionHubMode";

/** Compact Recipes ↔ Jobs switch for the current mode (sidebar owns Assembly/Cutting/Recipe). */
export function ProductionSequenceStrip(props: { mode?: MfgMode }) {
  const loc = useLocation();
  const rawMode = () => props.mode ?? inferMfgModeFromPath(loc.pathname, loc.search) ?? "assembly";
  const mode = () => {
    const m = rawMode();
    return m === "all" ? "assembly" : m;
  };
  const copy = () => MFG_COPY[mode()];
  const onRecipes = () => loc.pathname.includes("/recipes");
  const onJobs = () =>
    loc.pathname.includes("/jobs") ||
    loc.pathname.startsWith("/app/production/issue-station") ||
    loc.pathname.startsWith("/app/production/receive-station") ||
    loc.pathname.startsWith("/app/production/weigh-parts");

  return (
    <Show when={rawMode() !== "all"}>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <p class="text-sm font-semibold text-text-primary">{copy().branchTitle}</p>
        <nav class="flex items-center gap-1 rounded-lg border border-stroke bg-white p-0.5" aria-label={`${copy().branchTitle} section`}>
          <A
            href={recipesHref(mode())}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            classList={{
              "bg-brand-600 text-white": onRecipes(),
              "text-text-secondary hover:text-text-primary": !onRecipes(),
            }}
            aria-current={onRecipes() ? "page" : undefined}
          >
            Recipes
          </A>
          <A
            href={jobsHref(mode())}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            classList={{
              "bg-brand-600 text-white": onJobs() && !onRecipes(),
              "text-text-secondary hover:text-text-primary": !(onJobs() && !onRecipes()),
            }}
            aria-current={onJobs() && !onRecipes() ? "page" : undefined}
          >
            Jobs
          </A>
        </nav>
      </div>
    </Show>
  );
}
