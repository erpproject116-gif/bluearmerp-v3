import { createEffect, type ParentComponent } from "solid-js";
import { useLocation } from "@solidjs/router";
import { ProductionSequenceStrip } from "./ProductionSequenceStrip";
import type { MfgMode } from "./mfgProductionMode";
import { inferMfgModeFromPath, persistLastMfgMode } from "./productionHubMode";

/** Production section wrapper — sequence strip on recipe, job, and floor pages only. */
export const ProductionLayout: ParentComponent<{ mode?: MfgMode }> = (props) => {
  const loc = useLocation();
  const resolvedMode = () => props.mode ?? inferMfgModeFromPath(loc.pathname, loc.search) ?? undefined;

  createEffect(() => {
    const mode = resolvedMode();
    if (mode) persistLastMfgMode(mode);
  });

  return (
    <>
      <ProductionSequenceStrip mode={resolvedMode()} />
      {props.children}
    </>
  );
};
