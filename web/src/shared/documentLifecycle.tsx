import type { JSX } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import { apiFetch } from "./api";
import {
  BulkLifecycleConfirmModal,
  type BulkLifecycleOutcome,
} from "./BulkLifecycleConfirmModal";
import { Modal } from "./Modal";
import { useToast } from "./toast";

/** Soft-delete / restore support for commercial documents (quotations, sales orders, sales,
 *  purchase requests, purchase orders, supplier invoices). Backend contract per document base:
 *  - GET  {base}?lifecycle=active|deleted|all
 *  - GET  {base}/{id}?lifecycle=…
 *  - GET  {base}/{id}/delete-impact
 *  - GET  {base}/{id}/lifecycle
 *  - POST {base}/{id}/actions/delete  { reason }
 *  - POST {base}/{id}/actions/restore { reason }
 *  - POST {base}/actions/bulk-delete  { ids, reason }
 *  - POST {base}/actions/bulk-restore { ids, reason }
 */

export type LifecycleFilter = "active" | "deleted" | "all";

export const LIFECYCLE_FILTER_OPTIONS: { value: LifecycleFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
  { value: "all", label: "All" },
];

export type LifecycleBlocker = {
  code: string;
  kind: string;
  label: string;
  count: number;
};

export type LifecycleImpact = {
  document_type: string;
  document_id: number;
  lifecycle: "active" | "deleted";
  can_delete: boolean;
  can_restore: boolean;
  blockers: LifecycleBlocker[];
};

export type LifecycleMeta = {
  document_type: string;
  document_id: number;
  lifecycle: "active" | "deleted";
  deleted_at?: string | null;
  delete_reason?: string | null;
  restored_at?: string | null;
  restore_reason?: string | null;
};

/** Append lifecycle to a detail/list URL when viewing beyond active records. */
export function withLifecycleParam(url: string, filter: LifecycleFilter): string {
  if (filter === "active") return url;
  return `${url}${url.includes("?") ? "&" : "?"}lifecycle=${filter}`;
}

export function fetchLifecycleImpact(apiBase: string, id: number) {
  return apiFetch<LifecycleImpact>(`${apiBase}/${id}/delete-impact`);
}

export function fetchLifecycleMeta(apiBase: string, id: number) {
  return apiFetch<LifecycleMeta>(`${apiBase}/${id}/lifecycle`);
}

export function bulkDeleteDocuments(apiBase: string, ids: number[], reason: string) {
  return apiFetch<BulkLifecycleOutcome>(`${apiBase}/actions/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  }, { silent: true });
}

export function bulkRestoreDocuments(apiBase: string, ids: number[], reason: string) {
  return apiFetch<BulkLifecycleOutcome>(`${apiBase}/actions/bulk-restore`, {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  }, { silent: true });
}

type UseDocumentLifecycleOptions = {
  /** e.g. "/api/v1/quotation/quotations" */
  apiBase: string;
  /** Lowercase display name, e.g. "quotation". */
  documentLabel: string;
  /** Permission gate for delete/restore actions; defaults to allowed. */
  canManage?: () => boolean;
  /** Called after a successful delete/restore (invalidate the list here). */
  onChanged: () => void;
};

export function useDocumentLifecycle(opts: UseDocumentLifecycleOptions) {
  const toast = useToast();
  const [filter, setFilterSignal] = createSignal<LifecycleFilter>("active");
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [target, setTarget] = createSignal<{ id: number; label: string } | null>(null);
  const [impact, setImpact] = createSignal<LifecycleImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = createSignal(false);
  const [reason, setReason] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
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

  /** Open the delete/restore dialog for a row; loads the impact preview. */
  const openDialog = async (id: number, label: string) => {
    if (!canManage()) return;
    setTarget({ id, label });
    setReason("");
    setImpact(null);
    setDialogOpen(true);
    setLoadingImpact(true);
    const res = await fetchLifecycleImpact(opts.apiBase, id);
    setLoadingImpact(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? `Couldn't check whether this ${opts.documentLabel} can be deleted. Try again.`);
      setDialogOpen(false);
      return;
    }
    setImpact(res.data);
  };

  const closeDialog = () => {
    if (submitting()) return;
    setDialogOpen(false);
  };

  const action = (): "delete" | "restore" => (impact()?.lifecycle === "deleted" ? "restore" : "delete");

  const actionAllowed = () => {
    const i = impact();
    if (!i) return false;
    return i.lifecycle === "deleted" ? i.can_restore : i.can_delete;
  };

  const submit = async () => {
    const t = target();
    if (!t || !impact()) return;
    const trimmed = reason().trim();
    if (!trimmed) {
      toast.warning("Enter a short reason before continuing.");
      return;
    }
    const act = action();
    setSubmitting(true);
    const res = await apiFetch<LifecycleImpact>(`${opts.apiBase}/${t.id}/actions/${act}`, {
      method: "POST",
      body: JSON.stringify({ reason: trimmed }),
    }, { silent: true });
    setSubmitting(false);
    if (!res.success) {
      // 409 ERR_DEPENDENCY_BLOCKED returns a fresh impact payload — surface it in place.
      if (res.data?.blockers?.length) setImpact(res.data);
      toast.warning(res.message ?? `Couldn't ${act} this ${opts.documentLabel}. Check the blockers and try again.`);
      return;
    }
    toast.success(act === "delete"
      ? `${capitalize(opts.documentLabel)} deleted.`
      : `${capitalize(opts.documentLabel)} restored.`);
    setDialogOpen(false);
    opts.onChanged();
  };

  /** Whether the record with this id is soft-deleted, given the current filter.
   *  Used to open detail modals read-only. Only calls the API in "All" view. */
  const resolveDeleted = async (id: number): Promise<boolean> => {
    if (filter() === "active") return false;
    if (filter() === "deleted") return true;
    const res = await fetchLifecycleMeta(opts.apiBase, id);
    return Boolean(res.success && res.data?.lifecycle === "deleted");
  };

  /** Detail URL with lifecycle passed through so deleted records load. */
  const detailUrl = (id: number) => withLifecycleParam(`${opts.apiBase}/${id}`, filter());

  const rowActionLabel = () => {
    if (filter() === "deleted") return "Restore";
    if (filter() === "all") return "Delete/Restore";
    return "Delete";
  };

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
      ? await bulkDeleteDocuments(opts.apiBase, ids, trimmed)
      : await bulkRestoreDocuments(opts.apiBase, ids, trimmed);
    setBulkSubmitting(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? `Couldn't finish the bulk ${act}. Try again.`);
      return;
    }
    setBulkOutcome(res.data);
    const ok = res.data.deleted ?? res.data.restored ?? 0;
    if (ok > 0) {
      toast.success(
        act === "delete"
          ? `Deleted ${ok}; ${res.data.skipped} skipped.`
          : `Restored ${ok}; ${res.data.skipped} skipped.`,
      );
      setSelectedIds(new Set<number>());
      opts.onChanged();
    } else {
      toast.warning(`No ${opts.documentLabel}s were ${act === "delete" ? "deleted" : "restored"}.`);
    }
  };

  /** Grid cell: a Delete (active view) / Restore (deleted view) link. Hidden without permission. */
  const RowAction = (props: { id: number; label: string }): JSX.Element => (
    <Show when={canManage()} fallback={<span class="text-text-secondary">—</span>}>
      <button
        type="button"
        class={filter() === "deleted" ? "text-brand-600 hover:underline" : "text-red-600 hover:underline"}
        onClick={(e) => {
          e.stopPropagation();
          void openDialog(props.id, props.label);
        }}
      >
        {rowActionLabel()}
      </button>
    </Show>
  );

  /** Toolbar select for Active / Deleted / All. Render inside `toolbarExtra`. */
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

  /** Bulk Delete / Restore buttons for the current selection. */
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

  /** The delete/restore confirmation dialog. Render once per page. */
  const Dialog = (): JSX.Element => (
    <Modal
      open={dialogOpen()}
      title={`${action() === "delete" ? "Delete" : "Restore"} ${opts.documentLabel}`}
      onClose={closeDialog}
      stacked
    >
      <Show when={!loadingImpact()} fallback={<p class="text-sm text-text-secondary">Checking dependencies…</p>}>
        <Show when={impact()}>
          {(i) => (
            <div class="space-y-4">
              <p class="text-sm text-text-primary">
                {action() === "delete" ? (
                  <>
                    You are about to delete <span class="font-medium">{target()?.label}</span>. It will be hidden
                    from active lists but kept for audit, and can be restored later.
                  </>
                ) : (
                  <>
                    You are about to restore <span class="font-medium">{target()?.label}</span>. It will appear in
                    active lists again.
                  </>
                )}
              </p>

              <Show when={i().blockers.length > 0}>
                <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p class="text-sm font-medium text-red-700">
                    This {opts.documentLabel} cannot be {action() === "delete" ? "deleted" : "restored"} because of:
                  </p>
                  <ul class="mt-1 list-disc pl-5 text-sm text-red-700">
                    <For each={i().blockers}>
                      {(b) => (
                        <li>
                          {b.label} ({b.count})
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={actionAllowed()}>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-primary">
                    Reason <span class="text-red-600">*</span>
                  </span>
                  <textarea
                    class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                    rows={3}
                    maxLength={2000}
                    placeholder={action() === "delete" ? "Why is this document being deleted?" : "Why is this document being restored?"}
                    value={reason()}
                    onInput={(e) => setReason(e.currentTarget.value)}
                  />
                </label>
              </Show>

              <div class="flex justify-end gap-2 border-t border-stroke pt-3">
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
                  onClick={closeDialog}
                >
                  {actionAllowed() ? "Cancel" : "Close"}
                </button>
                <Show when={actionAllowed()}>
                  <button
                    type="button"
                    class={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                      action() === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
                    }`}
                    disabled={submitting() || !reason().trim()}
                    onClick={() => void submit()}
                  >
                    {submitting()
                      ? action() === "delete" ? "Deleting…" : "Restoring…"
                      : action() === "delete" ? "Delete" : "Restore"}
                  </button>
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </Modal>
  );

  const BulkDialog = (): JSX.Element => (
    <BulkLifecycleConfirmModal
      open={bulkOpen()}
      action={bulkAction()}
      entityLabel={opts.documentLabel}
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
    canManage,
    openDialog,
    resolveDeleted,
    detailUrl,
    selectedIds,
    onSelectionChange,
    RowAction,
    FilterControl,
    BulkToolbar,
    Dialog,
    BulkDialog,
  };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Wrap modal body content: shows a notice and disables all form controls when readOnly.
 *  Uses a display:contents fieldset so layout is unchanged. */
export function LifecycleReadOnlyShell(props: {
  readOnly: boolean;
  notice?: string;
  children: JSX.Element;
}) {
  return (
    <>
      <Show when={props.readOnly}>
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {props.notice ?? "This document is deleted and read-only. Restore it to make changes."}
        </div>
      </Show>
      <fieldset disabled={props.readOnly} class="contents min-w-0">
        {props.children}
      </fieldset>
    </>
  );
}
