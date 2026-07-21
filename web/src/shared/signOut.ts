import { supabase, apiFetch } from "./api";
import { LAST_ACTIVITY_STORAGE_KEY } from "./sessionIdleClient";

/** Clears presence, usage session, server idle tracking, local activity, then Supabase session. */
export async function signOutApp(reason: "logout" | "idle_timeout" = "logout") {
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
  try {
    const { clearLoginOtpGate } = await import("../modules/auth/loginOtpGate");
    clearLoginOtpGate();
  } catch {
    /* otp gate clear is best-effort */
  }
  await supabase.auth.signOut();
}
