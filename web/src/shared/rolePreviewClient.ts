/** Role preview client helpers — avoid sticky flags and misleading CORS copy. */

export const ROLE_PREVIEW_FLAG = "bluearm_role_preview_active";
/** Set briefly around Start so recovery works before active flag is confirmed. */
export const ROLE_PREVIEW_ATTEMPT_FLAG = "bluearm_role_preview_attempt";

export function clearRolePreviewFlag() {
  try {
    sessionStorage.removeItem(ROLE_PREVIEW_FLAG);
  } catch {
    /* ignore */
  }
}

export function setRolePreviewFlag() {
  try {
    sessionStorage.setItem(ROLE_PREVIEW_FLAG, "1");
  } catch {
    /* ignore */
  }
}

export function isRolePreviewFlagSet(): boolean {
  try {
    return sessionStorage.getItem(ROLE_PREVIEW_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markRolePreviewAttempt() {
  try {
    sessionStorage.setItem(ROLE_PREVIEW_ATTEMPT_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearRolePreviewAttempt() {
  try {
    sessionStorage.removeItem(ROLE_PREVIEW_ATTEMPT_FLAG);
  } catch {
    /* ignore */
  }
}

/** True if Start was attempted in the last 2 minutes (or active flag set). */
export function isRolePreviewSuspected(): boolean {
  if (isRolePreviewFlagSet()) return true;
  try {
    const raw = sessionStorage.getItem(ROLE_PREVIEW_ATTEMPT_FLAG);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < 2 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Bootstrap / network copy when role preview is the likely cause (not generic CORS). */
export function rolePreviewBootstrapMessage(detail?: string | null): string {
  const extra = detail?.trim() ? ` ${detail.trim()}` : "";
  return (
    "Role preview could not finish loading your session." +
    extra +
    " Use Exit role preview, then hard-refresh (Ctrl+Shift+R) if the problem continues." +
    " A CORS console message is often a side effect of a failed /auth/me — not always a CORS_ORIGIN misconfiguration."
  );
}
