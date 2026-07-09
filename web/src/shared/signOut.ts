import { supabase, apiFetch } from "./api";
import { LAST_ACTIVITY_STORAGE_KEY } from "./sessionIdleClient";

/** Clears presence, server idle tracking, local activity, then Supabase session. */
export async function signOutApp() {
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
  await supabase.auth.signOut();
}
