import { createEffect } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { useAuth } from "./auth-context";
import { useSetupReadiness } from "./usePlatform";

/** Send new workspace admins to the setup wizard once until they skip or finish. */
export function SetupFirstRunRedirect() {
  const loc = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const readiness = useSetupReadiness();

  createEffect(() => {
    const path = loc.pathname;
    if (!path.startsWith("/app/dashboard")) return;
    if (path.startsWith("/app/setup")) return;

    const me = auth.me;
    const data = readiness.data;
    if (!me || !data || readiness.isLoading) return;

    const canManage =
      me.user.is_tenant_owner || me.user.is_store_admin || me.user.is_platform_superadmin;
    if (!canManage) return;
    if (data.required_complete || data.setup_wizard_skipped) return;

    navigate("/app/setup", { replace: true });
  });

  return null;
}
