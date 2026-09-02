import { createEffect, type ParentComponent } from "solid-js";
import { useLocation } from "@solidjs/router";
import { ProductionSequenceStrip } from "./ProductionSequenceStrip";
import type { MfgMode } from "./mfgProductionMode";
import { inferMfgModeFromPath, persistLastMfgMode } from "./productionHubMode";

/** Production section wrapper — sequence strip on recipe, job, and floor pages only. */
export const ProductionLayout: ParentComponent<{ mode?: MfgMode }> = (props) => {
  const loc = useLocation();
  createEffect(() => {
    const mode = props.mode ?? inferMfgModeFromPath(loc.pathname, loc.search);
    if (mode) persistLastMfgMode(mode);
  });

  return (
    <>
      <ProductionSequenceStrip mode={props.mode} />
      {props.children}
    </>
  );
};
