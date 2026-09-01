import type { ParentComponent } from "solid-js";
import { ProductionSequenceStrip } from "./ProductionSequenceStrip";
import type { MfgMode } from "./mfgProductionMode";

/** Production section wrapper — sequence strip on recipe, job, and floor pages only. */
export const ProductionLayout: ParentComponent<{ mode?: MfgMode }> = (props) => (
  <>
    <ProductionSequenceStrip mode={props.mode} />
    {props.children}
  </>
);
