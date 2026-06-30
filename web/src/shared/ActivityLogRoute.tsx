import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canViewActivityLogs, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Redirects users without activity-log permission. */
export const ActivityLogRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={canViewActivityLogs(auth.me)} fallback={<Navigate href="/app/inventory/partners" />}>
        {props.children}
      </Show>
    </Show>
  );
};
