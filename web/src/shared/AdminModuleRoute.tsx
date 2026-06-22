import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canManageUsers, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Redirects non-admins away from User Management routes. */
export const AdminModuleRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.loading} fallback={<SessionLoading />}>
      <Show when={canManageUsers(auth.me)} fallback={<Navigate href="/app/inventory/partners" />}>
        {props.children}
      </Show>
    </Show>
  );
};
