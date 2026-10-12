import { supabase, apiFetch } from "./api";
import { LAST_ACTIVITY_STORAGE_KEY } from "./sessionIdleClient";
import { clearReturnTo } from "./authReturnTo";
import { endOpenSupportSessionForSignOut } from "./leaveSupportSession";
import { getGlobalToast } from "./toast";

/**
 * Ends an open support session first, then clears presence, usage, and the Supabase session.
 * Returns false when that end fails so the caller stays on the page.
 */
export async function signOutApp(reason: "logout" | "idle_timeout" = "logout"): Promise<boolean> {
  const ended = await endOpenSupportSessionForSignOut();
  if (!ended.ok) {
    getGlobalToast()?.error(ended.message);
    return false;
  }
  try {
    const { endUsageSession } = await import("./UsageTracker");
    await endUsageSession(reason);
  } catch {
    /* usage end is best-effort */
  }
  try {
    const { clearPresence } = await import("./usePresence");
    await clearPresence();
  } catch {
    /* presence clear is best-effort */
  }
  try {
    await apiFetch("/api/v1/auth/session-ended", { method: "POST" }, { silent: true, background: true });
  } catch {
    /* session-ended is best-effort while token may still be valid */
  }
  try {
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // Intentional sign-out must not bounce back to the prior page after re-login.
  if (reason === "logout") {
    clearReturnTo();
  }
  await supabase.auth.signOut();
  return true;
}
