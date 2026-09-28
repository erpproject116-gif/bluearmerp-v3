/** Pure idle-logout decisions so sign-in and shell mount can be tested without a browser session. */

export function isAuthFlowPath(pathname: string): boolean {
  return pathname.startsWith("/signin") || pathname.startsWith("/auth/callback");
}

/**
 * A late ERR_SESSION_IDLE must not sign the user out when the request was silent,
 * background, or started on the sign-in flow. The start path is what matters:
 * the URL may already be /app by the time the response arrives.
 */
export function shouldHandleServerSessionIdle(
  options: { silent?: boolean; background?: boolean } | undefined,
  startPath: string,
): boolean {
  if (options?.silent || options?.background) return false;
  if (isAuthFlowPath(startPath)) return false;
  return true;
}

/**
 * A stamp already older than the idle window at shell mount is leftover from a
 * previous session. Replace it and start the timer from now instead of logging out immediately.
 */
export function mountActivityBase(
  now: number,
  stored: number,
  idleMs: number,
): { baseMs: number; replaceStored: boolean } {
  if (stored > 0 && now - stored >= idleMs) {
    return { baseMs: now, replaceStored: true };
  }
  if (stored <= 0) return { baseMs: now, replaceStored: false };
  return { baseMs: stored, replaceStored: false };
}
