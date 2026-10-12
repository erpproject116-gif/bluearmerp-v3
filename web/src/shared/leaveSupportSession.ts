import { apiFetch } from "./api";
import { setActiveTenantId } from "./activeContext";

export type SupportSessionSnapshot = {
  id: number;
  customer_id: number;
  previous_active_tenant_id?: number | null;
};

/** Previous business only when that membership is still on /auth/me. Otherwise leave the pin unset. */
export function restoredTenantId(
  previous: number | null | undefined,
  memberships: { tenant_id: number }[] | undefined,
): number | null {
  if (previous == null || previous <= 0) return null;
  if (!memberships?.some((m) => m.tenant_id === previous)) return null;
  return previous;
}

export async function endSupportSessionById(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(
      `/api/v1/platform/console/support-sessions/${sessionId}/end`,
      { method: "POST", body: "{}" },
      { silent: true, background: true },
    );
    if (res.ok || res.code === "ERR_SUPPORT_SESSION_EXPIRED") return { ok: true };
    return { ok: false, message: res.message ?? "Could not end support session." };
  } catch {
    return { ok: false, message: "Could not end support session." };
  }
}

/**
 * Ends an open support session before sign-out and drops the remoted tenant pin.
 * Tenant users without platform.support.access are unchanged.
 * Returns false when a session exists and end failed — caller must stay signed in.
 */
export async function endOpenSupportSessionForSignOut(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  let mine: Awaited<ReturnType<typeof apiFetch<SupportSessionSnapshot | null>>>;
  try {
    mine = await apiFetch<SupportSessionSnapshot | null>(
      "/api/v1/platform/console/support-sessions/mine",
      {},
      { silent: true, background: true },
    );
  } catch {
    return { ok: false, message: "Could not check the support session before sign-out." };
  }
  if (!mine.ok) {
    if (mine.status === 403 || mine.code === "ERR_FORBIDDEN" || mine.status === 404) return { ok: true };
    return { ok: false, message: mine.message ?? "Could not check the support session before sign-out." };
  }
  const id = mine.data?.id;
  if (!id) return { ok: true };
  const ended = await endSupportSessionById(id);
  if (!ended.ok) return ended;
  setActiveTenantId(null);
  return { ok: true };
}
