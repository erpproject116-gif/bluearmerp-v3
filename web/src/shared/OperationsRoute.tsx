import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { hasModuleAccess, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

export const OperationsRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={hasModuleAccess(auth.me, "operations")} fallback={<Navigate href="/app/dashboard" />}>
        {props.children}
      </Show>
    </Show>
  );
};
