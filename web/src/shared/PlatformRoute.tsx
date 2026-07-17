import { type ParentComponent, Show } from "solid-js";
import { Navigate } from "@solidjs/router";
import { canAccessPlatformConsole, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";

/** Legacy wrapper — prefer PlatformCommandRoute for /app/platform-command. */
export const PlatformRoute: ParentComponent = (props) => {
  const auth = useAuth();
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={canAccessPlatformConsole(auth.me)} fallback={<Navigate href="/app/dashboard" />}>
        {props.children}
      </Show>
    </Show>
  );
};
