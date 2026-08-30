import type { ParentComponent } from "solid-js";

/** Passthrough wrapper — Production section tabs live in the app header/sidebar. */
export const ProductionLayout: ParentComponent = (props) => <>{props.children}</>;
