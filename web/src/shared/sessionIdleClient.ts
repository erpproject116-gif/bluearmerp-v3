import { signOutApp } from "./signOut";

let handling = false;

export const IDLE_LOGOUT_MS = 20 * 60 * 1000;
export const IDLE_WARN_MS = 18 * 60 * 1000;
export const LAST_ACTIVITY_STORAGE_KEY = "erp_last_user_activity";

export function isIdleLogoutExemptPath(pathname: string): boolean {
  return pathname.startsWith("/app/pos") || pathname.startsWith("/auth");
}

export async function handleServerSessionIdle() {
  if (handling) return;
  handling = true;
  try {
    await signOutApp();
  } finally {
    window.location.href = "/signin?reason=idle";
  }
}

export function touchLocalActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function readLocalActivity(): number {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
