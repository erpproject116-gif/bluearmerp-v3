import { For, Show, createEffect, createSignal } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../shared/api";
import { useAuth } from "../shared/auth-context";
import { getActiveBranch, setActiveBranch } from "../shared/activeContext";
import { useShell } from "./shell-context";

type Branch = { id: number; location_code: string; location_name: string; location_type: string };

/** Sentinel select value for company-wide view (omit X-Branch-ID). */
const ALL_BRANCHES = "all";

/**
 * Sidebar-footer control: pick active business first, then branch (when the business
 * has multiple locations). Business switch reloads tenant-scoped data; branch switch
 * invalidates cached lists and refreshes the current page.
 *
 * Owners / platform / support default to "All branches" (company-wide) when no
 * preference is stored. Selecting a branch sends X-Branch-ID for server view-scope.
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

  const canAllBranches = () => {
    const u = auth.me?.user;
    return Boolean(
      u?.is_tenant_owner || u?.is_platform_superadmin || auth.me?.support_session,
    );
  };

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

  /** null = All branches (view-all users only); number = specific location */
  const [selectedBranchId, setSelectedBranchId] = createSignal<number | null>(null);
  const [switchingBusiness, setSwitchingBusiness] = createSignal(false);
  const [hydrated, setHydrated] = createSignal(false);

  createEffect(() => {
    const list = branches();
    const tid = tenantId();
    if (!list || list.length === 0 || !tid) return;
    const stored = getActiveBranch(tid);
    if (stored && list.some((b) => b.id === stored.id)) {
      setSelectedBranchId(stored.id);
      setHydrated(true);
      return;
    }
    // Owners default to All branches; store staff keep first-branch auto-pick.
    if (canAllBranches()) {
      setActiveBranch(tid, null);
      setSelectedBranchId(null);
      setHydrated(true);
      return;
    }
    const first = list[0];
    setActiveBranch(tid, { id: first.id, name: first.location_name });
    setSelectedBranchId(first.id);
    setHydrated(true);
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
      // setActiveTenantId already clears the query cache; navigate home for a clean shell.
      navigate("/app", { replace: true });
    } finally {
      setSwitchingBusiness(false);
    }
  };

  const onBranchChange = (idStr: string) => {
    const tid = tenantId();
    if (idStr === ALL_BRANCHES) {
      if (selectedBranchId() === null) return;
      setActiveBranch(tid, null);
      setSelectedBranchId(null);
      refreshPageData();
      return;
    }
    const id = Number.parseInt(idStr, 10);
    const b = (branches() ?? []).find((x) => x.id === id);
    if (!b || id === selectedBranchId()) return;
    setActiveBranch(tid, { id: b.id, name: b.location_name });
    setSelectedBranchId(b.id);
    refreshPageData();
  };

  const currentBusinessName = () =>
    auth.me?.tenant.company_name ?? memberships().find((m) => m.tenant_id === tenantId())?.company_name ?? "Business";

  const selectValue = () => {
    const id = selectedBranchId();
    if (id == null && canAllBranches()) return ALL_BRANCHES;
    return id != null ? String(id) : "";
  };

  const viewingLabel = () => {
    const id = selectedBranchId();
    if (id == null && canAllBranches()) return "All branches";
    const b = branches().find((x) => x.id === id);
    return b?.location_name ?? "—";
  };

  return (
    <Show when={!shell.collapsed() && auth.me}>
      <div class="rounded-lg border border-stroke erp-panel px-3 py-2 space-y-2">
        <div>
          <label class="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-text-secondary">
            Active business
          </label>
          <Show
            when={hasMultipleBusinesses() && !auth.me?.support_session}
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
              value={hydrated() ? selectValue() : ""}
              onChange={(e) => onBranchChange(e.currentTarget.value)}
            >
              <Show when={canAllBranches()}>
                <option value={ALL_BRANCHES}>All branches</option>
              </Show>
              <For each={branches()}>{(b) => <option value={b.id}>{b.location_name}</option>}</For>
            </select>
            <p class="mt-1 truncate text-[0.65rem] text-text-secondary" title={viewingLabel()}>
              Viewing: {viewingLabel()}
            </p>
          </div>
        </Show>
      </div>
    </Show>
  );
}
