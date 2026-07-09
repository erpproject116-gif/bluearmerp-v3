import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { hasModuleAccess, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Redirects users without Communications module access. */
export const CommsRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={hasModuleAccess(auth.me, "comms")} fallback={<Navigate href="/app/dashboard" />}>
        {props.children}
      </Show>
    </Show>
  );
};
