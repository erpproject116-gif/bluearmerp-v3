import { apiFetch } from "./api";
import type { MeData } from "./auth-context";
import type { SetupReadiness } from "./usePlatform";

export function canManageWorkspaceSetup(me: MeData | null | undefined): boolean {
  if (!me) return false;
  const u = me.user;
  return Boolean(u.is_tenant_owner || u.is_store_admin || u.is_platform_superadmin);
}

/** First screen after sign-in — send new workspace admins to setup when foundation is incomplete. */
export async function resolveAppEntryPath(me: MeData | null | undefined): Promise<string> {
  if (!me) return "/signin";
  if (!canManageWorkspaceSetup(me)) return "/app/dashboard";

  try {
    const res = await apiFetch<SetupReadiness>(
      "/api/v1/platform/setup-readiness",
      {},
      { silent: true, background: true },
    );
    if (res.data && !res.data.required_complete && !res.data.setup_wizard_skipped) {
      return "/app/setup";
    }
  } catch {
    /* fall through */
  }

  return "/app/dashboard";
}
