import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch } from "../shared/api";
import { useAuth, hasPlatformPermission } from "../shared/auth-context";
import { setActiveTenantId } from "../shared/activeContext";
import { getGlobalToast } from "../shared/toast";

type SupportSession = {
  id: number;
  tenant_id: number;
  customer_id: number;
  company_code?: string;
  company_name?: string;
  ends_at: string;
  access_mode: string;
  reason?: string;
  stealth?: boolean;
  extends_used?: number;
  can_extend?: boolean;
  previous_active_tenant_id?: number | null;
};

function formatRemaining(endsAtMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Agent-only remoting chrome (requires platform.support.access).
 * Stealth sessions hide the amber strip so screen-share does not show remoting;
 * a discreet Exit control remains for the agent.
 */
export function SupportSessionBanner() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = createSignal(Date.now());
  const [busy, setBusy] = createSignal(false);

  const sess = (): SupportSession | null =>
    (auth.me?.support_session as SupportSession | undefined) ?? null;

  const visibleSession = (): SupportSession | undefined => {
    const s = sess();
    if (!s || !hasPlatformPermission(auth.me, "platform.support.access")) return undefined;
    return s;
  };

  const isStealth = () => Boolean(visibleSession()?.stealth);

  createEffect(() => {
    if (!visibleSession()) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(t));
  });

  const endsAtMs = () => {
    const s = visibleSession();
    return s ? Date.parse(s.ends_at) : 0;
  };

  /**
   * Shared remoting exit: end API → clear remoted X-Tenant-ID → refresh → platform customer.
   * Used by End, stealth Exit, and bluearm:support-session-expired.
   */
  const exitSupportSession = async (opts?: { skipEndApi?: boolean }) => {
    const s = sess();
    if (!s || busy()) return;
    const customerId = s.customer_id;
    const previous =
      s.previous_active_tenant_id && s.previous_active_tenant_id > 0
        ? s.previous_active_tenant_id
        : null;
    setBusy(true);
    try {
      if (!opts?.skipEndApi) {
        const res = await apiFetch(`/api/v1/platform/console/support-sessions/${s.id}/end`, {
          method: "POST",
          body: "{}",
        });
        if (!res.ok && res.code !== "ERR_SUPPORT_SESSION_EXPIRED") {
          getGlobalToast()?.error(res.message ?? "Could not end support session.");
          return;
        }
      }
      // Drop remoted X-Tenant-ID before refresh so subsequent calls are not pinned.
      setActiveTenantId(previous);
      await auth.refresh();
      navigate(`/app/platform-command/customers/${customerId}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    const onExpired = () => {
      void exitSupportSession({ skipEndApi: true });
    };
    window.addEventListener("bluearm:support-session-expired", onExpired);
    onCleanup(() => window.removeEventListener("bluearm:support-session-expired", onExpired));
  });

  const extendSession = async () => {
    const s = sess();
    if (!s || busy() || !s.can_extend) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/platform/console/support-sessions/${s.id}/extend`, {
        method: "POST",
        body: "{}",
      });
      if (!res.ok) {
        getGlobalToast()?.error(res.message ?? "Could not extend.");
        return;
      }
      await auth.refresh();
      getGlobalToast()?.success("Support session extended.");
    } finally {
      setBusy(false);
    }
  };

  // Keep X-Tenant-ID aligned with the support tenant while remoting.
  createEffect(() => {
    const s = visibleSession();
    if (s?.tenant_id) setActiveTenantId(s.tenant_id);
  });

  return (
    <Show when={visibleSession()}>
      {(s) => (
        <Show
          when={!isStealth()}
          fallback={
            <div class="pointer-events-none fixed bottom-3 right-3 z-[90]">
              <div class="pointer-events-auto flex items-center gap-1.5 rounded-md border border-stroke bg-white/95 px-2 py-1 text-[11px] text-text-secondary shadow-sm">
                <span class="tabular-nums opacity-70">{formatRemaining(endsAtMs(), now())}</span>
                <Show when={s().can_extend}>
                  <button
                    type="button"
                    class="rounded border border-stroke px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void extendSession()}
                    title="Extend +30m"
                  >
                    +30
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded border border-stroke px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void exitSupportSession()}
                  title="Exit remoting"
                >
                  Exit
                </button>
              </div>
            </div>
          }
        >
          <div
            class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <div class="min-w-0">
              <p class="font-semibold">
                Support session · {s().company_name || s().company_code || "Workspace"}
                <span
                  class="ml-2 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide"
                  classList={{
                    "bg-slate-800 text-white": s().access_mode === "read_write",
                    "bg-amber-200 text-amber-950": s().access_mode !== "read_write",
                  }}
                >
                  {s().access_mode === "read_write" ? "Write" : "Read only"}
                </span>
              </p>
              <p class="mt-0.5 text-xs text-amber-900/80">
                Ends in {formatRemaining(endsAtMs(), now())}
                <Show when={s().reason}> · {s().reason}</Show>
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <Show when={s().can_extend}>
                <button
                  type="button"
                  class="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void extendSession()}
                >
                  Extend +30m
                </button>
              </Show>
              <button
                type="button"
                class="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-950 disabled:opacity-50"
                disabled={busy()}
                onClick={() => void exitSupportSession()}
              >
                End support
              </button>
            </div>
          </div>
        </Show>
      )}
    </Show>
  );
}
