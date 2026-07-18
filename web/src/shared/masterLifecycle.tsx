import type { JSX } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import { apiFetch } from "./api";
import {
  BulkLifecycleConfirmModal,
  type BulkLifecycleOutcome,
} from "./BulkLifecycleConfirmModal";
import {
  LIFECYCLE_FILTER_OPTIONS,
  type LifecycleFilter,
} from "./documentLifecycle";
import { useToast } from "./toast";

/** Soft-delete / restore for inventory masters (partners, items, locations) and similar. */

export function bulkDeleteMasters(apiBase: string, ids: number[], reason: string) {
  return apiFetch<BulkLifecycleOutcome>(`${apiBase}/actions/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  }, { silent: true });
}

export function bulkRestoreMasters(apiBase: string, ids: number[], reason: string) {
  return apiFetch<BulkLifecycleOutcome>(`${apiBase}/actions/bulk-restore`, {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  }, { silent: true });
}

export function deleteMaster(apiBase: string, id: number, reason: string) {
  return apiFetch(`${apiBase}/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  }, { silent: true });
}

export function restoreMaster(apiBase: string, id: number, reason: string) {
  return apiFetch(`${apiBase}/${id}/restore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }, { silent: true });
}

type Options = {
  /** e.g. "/api/v1/inventory/partners" */
  apiBase: string;
  entityLabel: string;
  canManage?: () => boolean;
  onChanged: () => void;
};

export function useMasterLifecycle(opts: Options) {
  const toast = useToast();
  const [filter, setFilterSignal] = createSignal<LifecycleFilter>("active");
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set<number>());
  const [bulkOpen, setBulkOpen] = createSignal(false);
  const [bulkAction, setBulkAction] = createSignal<"delete" | "restore">("delete");
  const [bulkSubmitting, setBulkSubmitting] = createSignal(false);
  const [bulkOutcome, setBulkOutcome] = createSignal<BulkLifecycleOutcome | null>(null);

  const canManage = () => opts.canManage?.() ?? true;

  const setFilter = (value: string) => {
    setFilterSignal(value === "deleted" || value === "all" ? value : "active");
    setSelectedIds(new Set<number>());
  };

  const onSelectionChange = (ids: Set<number>) => setSelectedIds(new Set(ids));

  const openBulk = (act: "delete" | "restore") => {
    if (!canManage() || selectedIds().size === 0) return;
    setBulkAction(act);
    setBulkOutcome(null);
    setBulkOpen(true);
  };

  const closeBulk = () => {
    if (bulkSubmitting()) return;
    setBulkOpen(false);
    setBulkOutcome(null);
  };

  const submitBulk = async (trimmed: string) => {
    const ids = [...selectedIds()];
    if (ids.length === 0) return;
    const act = bulkAction();
    setBulkSubmitting(true);
    const res = act === "delete"
      ? await bulkDeleteMasters(opts.apiBase, ids, trimmed)
      : await bulkRestoreMasters(opts.apiBase, ids, trimmed);
    setBulkSubmitting(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? `Bulk ${act} failed.`);
      return;
    }
    setBulkOutcome(res.data);
    const ok = res.data.deleted ?? res.data.restored ?? 0;
    if (ok > 0) {
      toast.success(`Bulk ${act}: ${ok} succeeded, ${res.data.skipped} skipped.`);
      setSelectedIds(new Set<number>());
      opts.onChanged();
    } else {
      toast.warning(`No ${opts.entityLabel}s were ${act === "delete" ? "deleted" : "restored"}.`);
    }
  };

  const FilterControl = (): JSX.Element => (
    <label class="shrink-0">
      <span class="mb-1 block text-xs font-medium text-text-primary">Records</span>
      <select
        class="h-10 rounded-lg border border-stroke bg-white px-3 text-sm text-text-primary"
        value={filter()}
        onChange={(e) => setFilter(e.currentTarget.value)}
      >
        <For each={LIFECYCLE_FILTER_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
    </label>
  );

  const BulkToolbar = (): JSX.Element => (
    <Show when={canManage()}>
      <div class="flex items-end gap-2">
        <Show when={filter() !== "deleted"}>
          <button
            type="button"
            class="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            disabled={selectedIds().size === 0}
            onClick={() => openBulk("delete")}
          >
            Delete selected{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
          </button>
        </Show>
        <Show when={filter() !== "active"}>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            disabled={selectedIds().size === 0}
            onClick={() => openBulk("restore")}
          >
            Restore selected{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
          </button>
        </Show>
      </div>
    </Show>
  );

  const BulkDialog = (): JSX.Element => (
    <BulkLifecycleConfirmModal
      open={bulkOpen()}
      action={bulkAction()}
      entityLabel={opts.entityLabel}
      count={selectedIds().size}
      submitting={bulkSubmitting()}
      outcome={bulkOutcome()}
      onClose={closeBulk}
      onConfirm={(r) => void submitBulk(r)}
    />
  );

  return {
    filter,
    setFilter,
    selectedIds,
    onSelectionChange,
    FilterControl,
    BulkToolbar,
    BulkDialog,
  };
}
