import type { ParentComponent } from "solid-js";

/** Quotation module pages render inside AppShell; sub-branches use Tax Management header nav. */
export const QuotationLayout: ParentComponent = (props) => <>{props.children}</>;
