import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useAuth } from "../shared/auth-context";
import { apiFetch } from "../shared/api";
import { getGlobalToast } from "../shared/toast";
import { clearRolePreviewAttempt, clearRolePreviewFlag } from "../shared/rolePreviewClient";

type RolePreview = {
  active: boolean;
  role_code: string;
  real_role?: string;
  home_location_id?: number;
  expires_at?: string;
  can_extend?: boolean;
};

function formatRemaining(endsAtMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Persistent chrome while owner/superadmin is viewing as a role template (read-only). */
export function RolePreviewBanner() {
  const auth = useAuth();
  const [now, setNow] = createSignal(Date.now());
  const [busy, setBusy] = createSignal(false);

  const preview = (): RolePreview | null =>
    (auth.me?.role_preview as RolePreview | undefined)?.active
      ? (auth.me!.role_preview as RolePreview)
      : null;

  createEffect(() => {
    if (!preview()) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(t));
  });

  const endsAtMs = () => {
    const p = preview();
    return p?.expires_at ? Date.parse(p.expires_at) : 0;
  };

  const endPreview = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/auth/role-preview/end", { method: "POST", body: "{}" });
      if (!res.ok) {
        getGlobalToast()?.error(res.message ?? "Could not end role preview.");
        return;
      }
      clearRolePreviewFlag();
      clearRolePreviewAttempt();
      await auth.refresh();
      getGlobalToast()?.success("Exited role preview.");
    } finally {
      setBusy(false);
    }
  };

  const extendPreview = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/v1/auth/role-preview/extend", { method: "POST", body: "{}" });
      if (!res.ok) {
        getGlobalToast()?.error(res.message ?? "Could not extend role preview.");
        return;
      }
      await auth.refresh();
      getGlobalToast()?.success("Role preview extended.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={preview()}>
      {(p) => (
        <div
          class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <div>
            <p class="font-semibold">
              Viewing as <span class="capitalize">{p().role_code.replace(/_/g, " ")}</span>
              <Show when={p().real_role}>
                {" "}
                <span class="font-normal text-amber-800/80">(real role: {p().real_role})</span>
              </Show>
            </p>
            <p class="mt-0.5 text-xs text-amber-900/80">
              Role template preview — read-only. Not the same as impersonating a specific user.
              <Show when={endsAtMs() > 0}>
                {" "}
                · {formatRemaining(endsAtMs(), now())} left
              </Show>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Show when={p().can_extend !== false}>
              <button
                type="button"
                class="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                disabled={busy()}
                onClick={() => void extendPreview()}
              >
                +30 min
              </button>
            </Show>
            <button
              type="button"
              class="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 disabled:opacity-50"
              disabled={busy()}
              onClick={() => void endPreview()}
            >
              Exit preview
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
