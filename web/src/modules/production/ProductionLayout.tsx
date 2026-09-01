import type { ParentComponent } from "solid-js";
import { ProductionSequenceStrip } from "./ProductionSequenceStrip";

/** Production section wrapper — sequence strip lives above every Production page. */
export const ProductionLayout: ParentComponent = (props) => (
  <>
    <ProductionSequenceStrip />
    {props.children}
  </>
);
