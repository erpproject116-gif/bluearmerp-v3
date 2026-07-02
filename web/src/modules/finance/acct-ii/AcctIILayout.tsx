import type { ParentComponent } from "solid-js";

/** Wraps Acct. II list pages under consistent layout spacing. */
export const AcctIILayout: ParentComponent = (props) => (
  <div class="space-y-4">{props.children}</div>
);
