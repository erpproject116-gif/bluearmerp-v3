import type { ParentComponent } from "solid-js";
import { ProductionSequenceStrip } from "../production/ProductionSequenceStrip";

/** Recipes (BOMs) share the Production sequence strip. */
export const ManufacturingLayout: ParentComponent = (props) => (
  <>
    <ProductionSequenceStrip />
    {props.children}
  </>
);
