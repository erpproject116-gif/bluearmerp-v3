// Client-side "active business" and "active branch" selection, persisted in localStorage.
// Avoid importing auth-context here (cycle with apiFetch). queryClient is safe.

import { resetTenantScopedCache } from "./queryClient";

const TENANT_KEY = "bluearm.activeTenantId";

function branchKey(tenantId: number): string {
  return `bluearm.activeBranch.${tenantId}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The business (tenant) the user last selected, or null to let the server pick a default. */
export function getActiveTenantId(): number | null {
  const raw = safeLocalStorage()?.getItem(TENANT_KEY);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setActiveTenantId(id: number | null): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const prev = getActiveTenantId();
  const next = id && id > 0 ? id : null;
  if (next) ls.setItem(TENANT_KEY, String(next));
  else ls.removeItem(TENANT_KEY);
  // Clear React Query so form fields / policies / lists cannot leak across workspaces.
  if (prev !== next) resetTenantScopedCache();
}

export type ActiveBranch = { id: number; name: string };

/** The active branch (location) for a given business, or null when none is chosen. */
export function getActiveBranch(tenantId: number): ActiveBranch | null {
  if (!tenantId) return null;
  const raw = safeLocalStorage()?.getItem(branchKey(tenantId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveBranch;
    if (parsed && typeof parsed.id === "number" && parsed.id > 0) return parsed;
  } catch {
    /* ignore malformed */
  }
  return null;
}

export function setActiveBranch(tenantId: number, branch: ActiveBranch | null): void {
  const ls = safeLocalStorage();
  if (!ls || !tenantId) return;
  if (branch && branch.id > 0) ls.setItem(branchKey(tenantId), JSON.stringify(branch));
  else ls.removeItem(branchKey(tenantId));
}

/** Active branch for the currently-selected business (convenience for document modals). */
export function getActiveBranchCurrent(): ActiveBranch | null {
  const tid = getActiveTenantId();
  return tid ? getActiveBranch(tid) : null;
}

/** Active branch id for the currently-selected business, for X-Branch-ID header. */
export function getActiveBranchIdCurrent(): number | null {
  return getActiveBranchCurrent()?.id ?? null;
}
