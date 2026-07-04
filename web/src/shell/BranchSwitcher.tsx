import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import { apiFetch } from "../shared/api";
import { useAuth } from "../shared/auth-context";
import { getActiveBranch, setActiveBranch } from "../shared/activeContext";
import { useShell } from "./shell-context";

type Branch = { id: number; location_code: string; location_name: string; location_type: string };

/**
 * Sidebar-footer picker for the user's active branch (location). The selection is a
 * client-side working context: it defaults the location on new documents (Sales, Sales
 * Order, etc.). Hidden when the user has 0-1 branches or the sidebar is collapsed.
 */
export function BranchSwitcher() {
  const auth = useAuth();
  const shell = useShell();
  const tenantId = () => auth.me?.tenant.id ?? 0;

  const [branches] = createResource(tenantId, async (tid) => {
    if (!tid) return [] as Branch[];
    const res = await apiFetch<Branch[]>("/api/v1/auth/branches");
    return res.success && res.data ? res.data : [];
  });

  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  // Initialise from storage once branches load; fall back to the first branch.
  createEffect(() => {
    const list = branches();
    const tid = tenantId();
    if (!list || list.length === 0 || !tid) return;
    const stored = getActiveBranch(tid);
    if (stored && list.some((b) => b.id === stored.id)) {
      setSelectedId(stored.id);
      return;
    }
    const first = list[0];
    setActiveBranch(tid, { id: first.id, name: first.location_name });
    setSelectedId(first.id);
  });

  const onChange = (idStr: string) => {
    const id = Number.parseInt(idStr, 10);
    const b = (branches() ?? []).find((x) => x.id === id);
    if (!b) return;
    setActiveBranch(tenantId(), { id: b.id, name: b.location_name });
    setSelectedId(b.id);
  };

  return (
    <Show when={!shell.collapsed() && (branches()?.length ?? 0) > 1}>
      <div class="rounded-lg border border-stroke erp-panel px-3 py-2">
        <label class="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-text-secondary">
          Active branch
        </label>
        <select
          class="w-full bg-transparent text-sm font-medium text-text-primary focus:outline-none"
          value={selectedId() ?? ""}
          onChange={(e) => onChange(e.currentTarget.value)}
        >
          <For each={branches()}>{(b) => <option value={b.id}>{b.location_name}</option>}</For>
        </select>
      </div>
    </Show>
  );
}
