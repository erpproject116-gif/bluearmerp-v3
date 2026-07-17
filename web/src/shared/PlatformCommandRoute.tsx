import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canAccessPlatformConsole, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Guard for /app/platform-command — no ERP sidebar, auth + platform permission only. */
export const PlatformCommandRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={auth.me} fallback={<Navigate href="/signin" />}>
        <Show when={canAccessPlatformConsole(auth.me)} fallback={<Navigate href="/app/dashboard" />}>
          {props.children}
        </Show>
      </Show>
    </Show>
  );
};
