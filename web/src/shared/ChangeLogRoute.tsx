import { Navigate } from "@solidjs/router";
import { Show, type ParentComponent } from "solid-js";
import { canViewChangeLogs, useAuth } from "./auth-context";

/** Route guard for change log pages — requires activity_logs.changes or activity_logs.logs read access. */
export const ChangeLogRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.loading} fallback={<div class="p-8 text-sm text-text-secondary">Loading…</div>}>
      <Show when={canViewChangeLogs(auth.me)} fallback={<Navigate href="/app/inventory/partners" />}>
        {props.children}
      </Show>
    </Show>
  );
};
