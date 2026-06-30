import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canViewCrmAnalytics, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Redirects users without CRM analytics permission. */
export const CrmAnalyticsRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={canViewCrmAnalytics(auth.me)} fallback={<Navigate href="/app/crm/dashboard" />}>
        {props.children}
      </Show>
    </Show>
  );
};
