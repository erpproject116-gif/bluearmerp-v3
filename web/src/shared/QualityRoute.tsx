import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { hasModuleAccess, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

export const QualityRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={hasModuleAccess(auth.me, "quality")} fallback={<Navigate href="/app/dashboard" />}>
        {props.children}
      </Show>
    </Show>
  );
};
