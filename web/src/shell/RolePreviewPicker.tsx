import { For, Show, createSignal } from "solid-js";
import { useQuery } from "@tanstack/solid-query";
import { useAuth } from "../shared/auth-context";
import { apiFetch } from "../shared/api";
import { getGlobalToast } from "../shared/toast";

type RoleOpt = { role_code: string; role_name?: string; is_active?: boolean };
type LocOpt = { id: number; location_name: string; is_rma?: boolean; location_type?: string; status?: string };

/** Owner/superadmin control to start a read-only role template preview. */
export function RolePreviewPicker() {
  const auth = useAuth();
  const [open, setOpen] = createSignal(false);
  const [role, setRole] = createSignal("store_admin");
  const [homeId, setHomeId] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const canStart = () =>
    Boolean(auth.me?.user?.can_start_role_preview) && !auth.me?.role_preview?.active && !auth.me?.support_session;

  const roles = useQuery(() => ({
    queryKey: ["role-preview-roles"],
    enabled: open() && canStart(),
    queryFn: async () => {
      const res = await apiFetch<RoleOpt[]>("/api/v1/user-management/roles");
      if (!res.ok) return [] as RoleOpt[];
      return (res.data ?? []).filter(
        (r) =>
          r.is_active !== false &&
          r.role_code &&
          !["owner", "store_owner"].includes(String(r.role_code).toLowerCase()),
      );
    },
  }));

  const locs = useQuery(() => ({
    queryKey: ["role-preview-locs"],
    enabled: open() && canStart(),
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "200", status: "active" });
      const res = await apiFetch<LocOpt[]>(`/api/v1/inventory/locations?${qs}`);
      if (!res.ok) return [] as LocOpt[];
      return (res.data ?? []).filter(
        (l) =>
          !l.is_rma &&
          String(l.location_type || "").toLowerCase() !== "in_transit" &&
          (l.status == null || String(l.status).toLowerCase() === "active"),
      );
    },
  }));

  const start = async () => {
    if (busy() || !role()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { role_code: role() };
      const hid = Number(homeId());
      if (Number.isFinite(hid) && hid > 0) body.home_location_id = hid;
      const res = await apiFetch("/api/v1/auth/role-preview", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        getGlobalToast()?.error(res.message ?? "Could not start role preview.");
        return;
      }
      try {
        sessionStorage.setItem("bluearm_role_preview_active", "1");
      } catch {
        /* ignore */
      }
      setOpen(false);
      await auth.refresh();
      getGlobalToast()?.success(`Viewing as ${role()}. Read-only.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={canStart()}>
      <div class="relative">
        <button
          type="button"
          class="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
        >
          View as role…
        </button>
        <Show when={open()}>
          <div class="absolute bottom-full left-0 z-40 mb-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
            <p class="mb-2 text-xs font-medium text-text-primary">Role template preview</p>
            <label class="mb-2 block text-[11px] text-text-secondary">
              Role
              <select
                class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                value={role()}
                onChange={(e) => setRole(e.currentTarget.value)}
              >
                <For each={roles.data ?? [{ role_code: "store_admin" }, { role_code: "member" }]}>
                  {(r) => <option value={r.role_code}>{r.role_name || r.role_code}</option>}
                </For>
              </select>
            </label>
            <label class="mb-3 block text-[11px] text-text-secondary">
              Home branch (optional)
              <select
                class="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                value={homeId()}
                onChange={(e) => setHomeId(e.currentTarget.value)}
              >
                <option value="">Default / current</option>
                <For each={locs.data ?? []}>
                  {(l) => <option value={String(l.id)}>{l.location_name}</option>}
                </For>
              </select>
            </label>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded bg-brand-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={busy()}
                onClick={() => void start()}
              >
                Start
              </button>
              <button
                type="button"
                class="rounded border border-slate-200 px-2 py-1.5 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
