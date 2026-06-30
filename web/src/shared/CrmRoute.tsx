import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canViewCrm, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Redirects users without CRM view permission. */
export const CrmRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={canViewCrm(auth.me)} fallback={<Navigate href="/app/inventory/partners" />}>
        {props.children}
      </Show>
    </Show>
  );
};
