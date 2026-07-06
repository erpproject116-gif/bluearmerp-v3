import type { ParentComponent } from "solid-js";

/** Setup is encouraged via header reminder bar; no forced redirects. */
export const SetupGate: ParentComponent = (props) => props.children;
