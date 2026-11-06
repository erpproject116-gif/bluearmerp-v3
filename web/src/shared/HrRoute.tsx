import { type ParentComponent, Show } from "solid-js";
import { Navigate, useLocation } from "@solidjs/router";
import { hasModuleAccess, useAuth } from "./auth-context";
import { SessionLoading } from "./AuthRedirect";
import { isAgencyPath, useManpowerMode } from "../modules/hr/manpowerMode";

export const HrRoute: ParentComponent = (props) => {
  const auth = useAuth();
  const loc = useLocation();
  const mode = useManpowerMode();
  // Agency staffing Off hides agency routes for every user (including owners / POs).
  const blocked = () => !mode.loading() && !mode.enabled() && isAgencyPath(loc.pathname);
  return (
    <Show when={!auth.bootstrapping} fallback={<SessionLoading />}>
      <Show when={hasModuleAccess(auth.me, "hr")} fallback={<Navigate href="/app/dashboard" />}>
        <Show when={!blocked()} fallback={<Navigate href="/app/hr" />}>
          {props.children}
        </Show>
      </Show>
    </Show>
  );
};
