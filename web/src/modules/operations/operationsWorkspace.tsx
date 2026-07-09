import { createContext, createEffect, createSignal, useContext, type ParentComponent } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { useSearchParams } from "@solidjs/router";
import { For, Show } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import {
  boardWorkItemsQueryKey,
  fetchOperationsBoardWorkItems,
  fetchOperationsColumns,
  useOperationsWorkspaces,
} from "../../shared/useOperations";

const STORAGE_KEY = "operations-active-workspace-id";

type OperationsWorkspaceContextValue = {
  workspaceId: () => number | null;
  setWorkspaceId: (id: number | null) => void;
};

const OperationsWorkspaceContext = createContext<OperationsWorkspaceContextValue>();

function readStoredWorkspaceId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export const OperationsWorkspaceProvider: ParentComponent = (props) => {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [workspaceId, setWorkspaceIdSignal] = createSignal<number | null>(readStoredWorkspaceId());

  const setWorkspaceId = (id: number | null) => {
    setWorkspaceIdSignal(id);
    try {
      if (id && id > 0) localStorage.setItem(STORAGE_KEY, String(id));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 100 }));

  createEffect(() => {
    const code = typeof searchParams.ws === "string" ? searchParams.ws.trim() : "";
    if (!code) return;
    const match = workspaces.data?.rows.find((w) => w.workspace_code === code);
    if (match) setWorkspaceId(match.id);
  });

  // Drop stale IDs left in localStorage after purge or workspace delete.
  createEffect(() => {
    const id = workspaceId();
    const rows = workspaces.data?.rows;
    if (!id || !rows) return;
    if (!rows.some((w) => w.id === id)) setWorkspaceId(null);
  });

  // Warm board + column caches when workspace changes.
  createEffect(() => {
    const id = workspaceId();
    if (!id) return;
    void qc.prefetchQuery({
      queryKey: boardWorkItemsQueryKey(id),
      queryFn: () => fetchOperationsBoardWorkItems(id),
      staleTime: 60_000,
      retry: false,
    });
    void qc.prefetchQuery({
      queryKey: ["operations-columns", id],
      queryFn: () => fetchOperationsColumns(id),
      staleTime: 60_000,
      retry: false,
    });
  });

  return (
    <OperationsWorkspaceContext.Provider value={{ workspaceId, setWorkspaceId }}>
      {props.children}
    </OperationsWorkspaceContext.Provider>
  );
};

export function useOperationsWorkspace() {
  const ctx = useContext(OperationsWorkspaceContext);
  if (!ctx) {
    throw new Error("useOperationsWorkspace must be used within OperationsWorkspaceProvider");
  }
  return ctx;
}

export function OperationsWorkspaceSelector(props: { class?: string; allowAll?: boolean }) {
  const { workspaceId, setWorkspaceId } = useOperationsWorkspace();
  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 100 }));

  return (
    <div class={props.class ?? "flex flex-wrap items-center gap-2"}>
      <label class="text-sm text-text-secondary">Workspace</label>
      <select
        class={inputClass}
        value={workspaceId() ?? ""}
        onChange={(e) => {
          const id = Number(e.currentTarget.value);
          setWorkspaceId(Number.isFinite(id) && id > 0 ? id : null);
        }}
      >
        <option value="">{props.allowAll ? "All workspaces" : "Select workspace…"}</option>
        <For each={workspaces.data?.rows ?? []}>
          {(ws) => <option value={ws.id}>{ws.workspace_name}</option>}
        </For>
      </select>
      <Show when={workspaces.isFetching}>
        <span class="text-xs text-text-secondary">Loading…</span>
      </Show>
    </div>
  );
}
