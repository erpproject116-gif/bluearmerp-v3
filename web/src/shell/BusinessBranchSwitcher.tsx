import { For, Show, createEffect, createSignal } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../shared/api";
import { useAuth } from "../shared/auth-context";
import { getActiveBranch, setActiveBranch } from "../shared/activeContext";
import { useShell } from "./shell-context";

type Branch = { id: number; location_code: string; location_name: string; location_type: string };

/**
 * Sidebar-footer control: pick active business first, then branch (when the business
 * has multiple locations). Business switch reloads tenant-scoped data; branch switch
 * invalidates cached lists and refreshes the current page.
 */
export function BusinessBranchSwitcher() {
  const auth = useAuth();
  const shell = useShell();
  const navigate = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  const tenantId = () => auth.me?.tenant.id ?? 0;
  const memberships = () => auth.me?.memberships ?? [];
  const hasMultipleBusinesses = () => memberships().length > 1;

  // TanStack query (not createResource) so creating/renaming a location in
  // /app/inventory/locations refreshes this switcher immediately — the
  // "auth-branches" key is invalidated by inventory mutations.
  const branchesQuery = createQuery(() => ({
    queryKey: ["auth-branches", tenantId()],
    enabled: tenantId() > 0,
    queryFn: async () => {
      const res = await apiFetch<Branch[]>("/api/v1/auth/branches");
      return res.success && res.data ? res.data : [];
    },
  }));
  const branches = () => branchesQuery.data ?? [];

  const [selectedBranchId, setSelectedBranchId] = createSignal<number | null>(null);
  const [switchingBusiness, setSwitchingBusiness] = createSignal(false);

  createEffect(() => {
    const list = branches();
    const tid = tenantId();
    if (!list || list.length === 0 || !tid) return;
    const stored = getActiveBranch(tid);
    if (stored && list.some((b) => b.id === stored.id)) {
      setSelectedBranchId(stored.id);
      return;
    }
    const first = list[0];
    setActiveBranch(tid, { id: first.id, name: first.location_name });
    setSelectedBranchId(first.id);
  });

  const refreshPageData = () => {
    void queryClient.invalidateQueries();
    const path = loc.pathname + loc.search;
    navigate(path || "/app", { replace: true });
  };

  const onBusinessChange = async (idStr: string) => {
    const nextId = Number.parseInt(idStr, 10);
    if (!nextId || nextId === tenantId() || switchingBusiness()) return;
    setSwitchingBusiness(true);
    try {
      await auth.setActiveTenant(nextId);
      navigate("/app", { replace: true });
    } finally {
      setSwitchingBusiness(false);
    }
  };

  const onBranchChange = (idStr: string) => {
    const id = Number.parseInt(idStr, 10);
    const b = (branches() ?? []).find((x) => x.id === id);
    if (!b || id === selectedBranchId()) return;
    setActiveBranch(tenantId(), { id: b.id, name: b.location_name });
    setSelectedBranchId(b.id);
    refreshPageData();
  };

  const currentBusinessName = () =>
    auth.me?.tenant.company_name ?? memberships().find((m) => m.tenant_id === tenantId())?.company_name ?? "Business";

  return (
    <Show when={!shell.collapsed() && auth.me}>
      <div class="rounded-lg border border-stroke erp-panel px-3 py-2 space-y-2">
        <div>
          <label class="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-text-secondary">
            Active business
          </label>
          <Show
            when={hasMultipleBusinesses()}
            fallback={<p class="truncate text-sm font-medium text-text-primary">{currentBusinessName()}</p>}
          >
            <select
              class="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none disabled:opacity-60"
              value={tenantId() || ""}
              disabled={switchingBusiness()}
              onChange={(e) => void onBusinessChange(e.currentTarget.value)}
            >
              <For each={memberships()}>
                {(m) => <option value={m.tenant_id}>{m.company_name}</option>}
              </For>
            </select>
          </Show>
        </div>

        <Show when={(branches()?.length ?? 0) > 1}>
          <div>
            <label class="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-text-secondary">
              Active branch
            </label>
            <select
              class="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
              value={selectedBranchId() ?? ""}
              onChange={(e) => onBranchChange(e.currentTarget.value)}
            >
              <For each={branches()}>{(b) => <option value={b.id}>{b.location_name}</option>}</For>
            </select>
          </div>
        </Show>
      </div>
    </Show>
  );
}
