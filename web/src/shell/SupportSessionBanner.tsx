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
  extends_used?: number;
  can_extend?: boolean;
};

function formatRemaining(endsAtMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Amber strip while a Platform Command support session is active. */
export function SupportSessionBanner() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = createSignal(Date.now());
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!auth.me?.support_session) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(t));
  });

  const sess = (): SupportSession | null =>
    (auth.me?.support_session as SupportSession | undefined) ?? null;

  const endsAtMs = () => {
    const s = sess();
    return s ? Date.parse(s.ends_at) : 0;
  };

  const endSession = async () => {
    const s = sess();
    if (!s || busy()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/platform/console/support-sessions/${s.id}/end`, {
        method: "POST",
        body: "{}",
      });
      if (!res.ok) {
        getGlobalToast()?.error(res.message ?? "Could not end support session.");
        return;
      }
      await auth.refresh();
      navigate(`/app/platform-command/customers/${s.customer_id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

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

  // Keep X-Tenant-ID aligned with the support tenant.
  createEffect(() => {
    const s = sess();
    if (s?.tenant_id) setActiveTenantId(s.tenant_id);
  });

  return (
    <Show when={sess() && hasPlatformPermission(auth.me, "platform.support.access")}>
      {(s) => (
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
              onClick={() => void endSession()}
            >
              End support
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
