import type { MeData } from "./auth-context";
import { resolveAppEntryPath } from "./resolveAppEntryPath";

export const RETURN_TO_STORAGE_KEY = "erp_auth_return_to";

const ALLOWED_PREFIXES = ["/app/", "/portal/"] as const;

/** Reject open redirects and auth-loop paths. Returns a safe in-app path or null. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let value = raw.trim();
  if (!value) return null;

  // Decode once if it looks percent-encoded (e.g. from ?next=).
  try {
    if (value.includes("%")) {
      value = decodeURIComponent(value);
    }
  } catch {
    return null;
  }
  value = value.trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (
    lower.startsWith("http:") ||
    lower.startsWith("https:") ||
    lower.startsWith("//") ||
    lower.startsWith("\\\\") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:")
  ) {
    return null;
  }
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;

  const pathOnly = value.split(/[?#]/, 1)[0] ?? value;
  if (
    pathOnly === "/signin" ||
    pathOnly.startsWith("/signin/") ||
    pathOnly.startsWith("/auth") ||
    pathOnly === "/welcome" ||
    pathOnly.startsWith("/welcome/")
  ) {
    return null;
  }

  const allowed = ALLOWED_PREFIXES.some((p) => pathOnly === p.slice(0, -1) || pathOnly.startsWith(p));
  if (!allowed) return null;

  return value;
}

export function clearReturnTo() {
  try {
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function captureReturnTo(from?: string) {
  if (typeof window === "undefined") return;
  const raw =
    from ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safe = sanitizeReturnTo(raw);
  if (!safe) return;
  try {
    sessionStorage.setItem(RETURN_TO_STORAGE_KEY, safe);
  } catch {
    /* ignore */
  }
}

/** Read and clear a previously captured return path. */
export function consumeReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
    return sanitizeReturnTo(raw);
  } catch {
    return null;
  }
}

/** Persist ?next= from the sign-in URL so Google OAuth can restore it after /auth/callback. */
export function stashNextFromSearch(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next = sanitizeReturnTo(params.get("next"));
  if (!next) return;
  try {
    sessionStorage.setItem(RETURN_TO_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function buildSignInHref(opts?: { reason?: string; next?: string | null }): string {
  const qs = new URLSearchParams();
  if (opts?.reason) qs.set("reason", opts.reason);
  const next = sanitizeReturnTo(opts?.next ?? null);
  if (next) qs.set("next", next);
  const q = qs.toString();
  return q ? `/signin?${q}` : "/signin";
}

/**
 * After sign-in: setup gate wins; otherwise restore captured return-to if safe.
 * Does not consume return-to when sending the user to /app/setup.
 */
export async function resolvePostLoginPath(me: MeData | null | undefined): Promise<string> {
  const entry = await resolveAppEntryPath(me);
  if (!me) return entry;
  if (entry === "/app/setup") return entry;
  const ret = consumeReturnTo();
  return ret ?? entry;
}
