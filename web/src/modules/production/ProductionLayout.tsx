import type { ParentComponent } from "solid-js";
import { ProductionSequenceStrip } from "./ProductionSequenceStrip";
import type { MfgMode } from "./mfgProductionMode";

/** Production section wrapper — sequence strip lives above every Production page. */
export const ProductionLayout: ParentComponent<{ mode?: MfgMode }> = (props) => (
  <>
    <ProductionSequenceStrip mode={props.mode} />
    {props.children}
  </>
);
