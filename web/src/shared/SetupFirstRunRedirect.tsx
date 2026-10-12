import { createEffect } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { WORKSPACE_ONBOARDING_HREF } from "./resolveAppEntryPath";
import { useSetupReadiness } from "./usePlatform";

/** Keep unfinished workspace admins on Home onboarding until they skip or finish. */
export function SetupFirstRunRedirect() {
  const loc = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const readiness = useSetupReadiness();

  createEffect(() => {
    const path = loc.pathname;
    if (!path.startsWith("/app/dashboard")) return;
    if (path.startsWith(WORKSPACE_ONBOARDING_HREF) || path.startsWith("/app/dashboard/getting-started")) return;
    if (path.startsWith("/app/dashboard/recent-updates")) return;

    const me = auth.me;
    const data = readiness.data;
    if (!me || !data || readiness.isLoading) return;
    // Remoting another company must not bounce into that operator's setup.
    if (me.support_session) return;

    const canManage =
      me.user.is_tenant_owner || me.user.is_store_admin || me.user.is_platform_superadmin;
    if (!canManage) return;
    if (data.required_complete || data.setup_wizard_skipped) return;

    navigate(WORKSPACE_ONBOARDING_HREF, { replace: true });
  });

  return null;
}
