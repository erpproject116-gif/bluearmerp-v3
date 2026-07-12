import { For, Show, createSignal } from "solid-js";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import {
  createColumn,
  deleteColumn,
  patchColumn,
  patchWorkspace,
  reorderColumns,
  saveWorkspaceAsPack,
  type Column,
  type Workspace,
} from "../../shared/useOperations";

type Props = {
  open: boolean;
  workspace: Workspace;
  columns: Column[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function OperationsBoardSettingsModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [wsName, setWsName] = createSignal(props.workspace.workspace_name);
  const [newKey, setNewKey] = createSignal("");
  const [newName, setNewName] = createSignal("");
  const [savePackOpen, setSavePackOpen] = createSignal(false);
  const [packCode, setPackCode] = createSignal("");
  const [packName, setPackName] = createSignal("");

  const refreshLocalName = () => setWsName(props.workspace.workspace_name);

  const saveWorkspaceName = async () => {
    const name = wsName().trim();
    if (!name) {
      toast.warning("Workspace name is required.");
      return;
    }
    setSaving(true);
    const res = await patchWorkspace(props.workspace.id, { workspace_name: name });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update workspace.");
      return;
    }
    toast.success("Workspace updated.");
    props.onChanged();
  };

  const archiveWorkspace = async () => {
    if (!window.confirm(`Archive workspace “${props.workspace.workspace_name}”?`)) return;
    setSaving(true);
    const res = await patchWorkspace(props.workspace.id, { status: "archived" });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not archive workspace.");
      return;
    }
    toast.success("Workspace archived.");
    props.onChanged();
    props.onClose();
  };

  const addColumn = async () => {
    const key = newKey().trim().toLowerCase().replace(/\s+/g, "_");
    const name = newName().trim();
    if (!key || !name) {
      toast.warning("Column key and name are required.");
      return;
    }
    setSaving(true);
    const res = await createColumn(props.workspace.id, { column_key: key, column_name: name });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not add column.");
      return;
    }
    setNewKey("");
    setNewName("");
    toast.success("Column added.");
    props.onChanged();
  };

  const renameColumn = async (col: Column, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === col.column_name) return;
    const res = await patchColumn(props.workspace.id, col.id, { column_name: trimmed });
    if (!res.success) {
      toast.warning(res.message ?? "Could not rename column.");
      return;
    }
    props.onChanged();
  };

  const toggleDone = async (col: Column) => {
    const res = await patchColumn(props.workspace.id, col.id, { is_done: !col.is_done });
    if (!res.success) {
      toast.warning(res.message ?? "Could not update column.");
      return;
    }
    props.onChanged();
  };

  const moveColumn = async (col: Column, dir: -1 | 1) => {
    const cols = [...props.columns].sort((a, b) => a.sort_order - b.sort_order);
    const idx = cols.findIndex((c) => c.id === col.id);
    const swap = cols[idx + dir];
    if (!swap) return;
    const payload = [
      { id: col.id, sort_order: swap.sort_order },
      { id: swap.id, sort_order: col.sort_order },
    ];
    const res = await reorderColumns(props.workspace.id, payload);
    if (!res.success) {
      toast.warning(res.message ?? "Could not reorder columns.");
      return;
    }
    props.onChanged();
  };

  const removeColumn = async (col: Column) => {
    if (!window.confirm(`Archive column “${col.column_name}”? Cards stay linked until moved.`)) return;
    let res = await deleteColumn(props.workspace.id, col.id, false);
    if (!res.success && (res.message ?? "").toLowerCase().includes("work items")) {
      if (!window.confirm(`${res.message}\n\nArchive anyway?`)) return;
      res = await deleteColumn(props.workspace.id, col.id, true);
    }
    if (!res.success) {
      toast.warning(res.message ?? "Could not archive column.");
      return;
    }
    toast.success("Column archived.");
    props.onChanged();
  };

  const saveAsPack = async () => {
    const code = packCode().trim().toLowerCase();
    const name = packName().trim();
    if (!code || !name) {
      toast.warning("Pack code and name are required.");
      return;
    }
    setSaving(true);
    const res = await saveWorkspaceAsPack(props.workspace.id, {
      pack_code: code,
      pack_name: name,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save pack.");
      return;
    }
    toast.success("Board saved as industry pack.");
    setSavePackOpen(false);
  };

  return (
    <>
      <EntityModal
        open={props.open}
        title="Board settings"
        onClose={() => {
          refreshLocalName();
          props.onClose();
        }}
        onSave={() => void saveWorkspaceName()}
        saving={saving()}
      >
        <Field label="Workspace name">
          <input
            class={inputClass}
            value={wsName()}
            disabled={!props.canEdit}
            onInput={(e) => setWsName(e.currentTarget.value)}
          />
        </Field>

        <div class="mt-4">
          <p class="mb-2 text-sm font-medium text-text-primary">Kanban columns</p>
          <div class="space-y-2">
            <For each={[...props.columns].sort((a, b) => a.sort_order - b.sort_order)}>
              {(col) => (
                <div class="flex flex-wrap items-center gap-2 rounded-lg border border-stroke px-3 py-2">
                  <input
                    class={`${inputClass} min-w-[10rem] flex-1`}
                    value={col.column_name}
                    disabled={!props.canEdit}
                    onChange={(e) => void renameColumn(col, e.currentTarget.value)}
                  />
                  <span class="text-xs text-text-secondary">{col.column_key}</span>
                  <Show when={props.canEdit}>
                    <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => void moveColumn(col, -1)}>
                      Up
                    </button>
                    <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => void moveColumn(col, 1)}>
                      Down
                    </button>
                    <label class="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!col.is_done} onChange={() => void toggleDone(col)} />
                      Done
                    </label>
                    <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => void removeColumn(col)}>
                      Archive
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>

        <Show when={props.canEdit}>
          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            <Field label="New column key">
              <input
                class={inputClass}
                placeholder="e.g. review"
                value={newKey()}
                onInput={(e) => setNewKey(e.currentTarget.value)}
              />
            </Field>
            <Field label="New column name">
              <input
                class={inputClass}
                placeholder="e.g. Review"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            class="mt-2 rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
            disabled={saving()}
            onClick={() => void addColumn()}
          >
            Add column
          </button>
        </Show>

        <Show when={props.canEdit}>
          <div class="mt-6 flex flex-wrap gap-2 border-t border-stroke pt-4">
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                setPackCode(`ws_${props.workspace.workspace_code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
                setPackName(`${props.workspace.workspace_name} pack`);
                setSavePackOpen(true);
              }}
            >
              Save board as pack
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={() => void archiveWorkspace()}
            >
              Archive workspace
            </button>
          </div>
        </Show>
      </EntityModal>

      <EntityModal
        open={savePackOpen()}
        title="Save board as industry pack"
        onClose={() => setSavePackOpen(false)}
        onSave={() => void saveAsPack()}
        saving={saving()}
      >
        <Field label="Pack code">
          <input class={inputClass} value={packCode()} onInput={(e) => setPackCode(e.currentTarget.value)} />
        </Field>
        <Field label="Pack name">
          <input class={inputClass} value={packName()} onInput={(e) => setPackName(e.currentTarget.value)} />
        </Field>
        <p class="text-xs text-text-secondary">Saves current active columns as a reusable pack for this tenant.</p>
      </EntityModal>
    </>
  );
}
