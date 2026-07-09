import type { ParentComponent } from "solid-js";

/** Operations sub-nav lives in AppShell header — this is a content wrapper only. */
export const OperationsLayout: ParentComponent = (props) => <>{props.children}</>;
