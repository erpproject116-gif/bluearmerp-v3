import { For, Show, createEffect, createSignal } from "solid-js";
import { WideEntityModal } from "../../shared/WideEntityModal";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { patchPack, type IndustryPack } from "../../shared/useOperations";

export type PackColumnDraft = {
  localId: string;
  key: string;
  name: string;
  sort_order: number;
  color?: string;
  is_done?: boolean;
};

type Props = {
  open: boolean;
  pack: IndustryPack | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function slugKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "column";
}

let localSeq = 0;
function nextLocalId() {
  localSeq += 1;
  return `col_${localSeq}`;
}

export function OperationsPackEditorModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [columns, setColumns] = createSignal<PackColumnDraft[]>([]);
  const [newName, setNewName] = createSignal("");
  const [newKey, setNewKey] = createSignal("");

  createEffect(() => {
    if (!props.open || !props.pack) return;
    setName(props.pack.pack_name ?? "");
    setDescription(props.pack.description ?? props.pack.summary ?? "");
    const cols = (props.pack.columns ?? []).map((c, i) => ({
      localId: nextLocalId(),
      key: c.key,
      name: c.name,
      sort_order: c.sort_order ?? i * 10,
      color: c.color ?? "",
      is_done: Boolean(c.is_done),
    }));
    setColumns(cols.length > 0 ? cols : [
      { localId: nextLocalId(), key: "todo", name: "To Do", sort_order: 0 },
      { localId: nextLocalId(), key: "doing", name: "In Progress", sort_order: 10 },
      { localId: nextLocalId(), key: "done", name: "Done", sort_order: 20, is_done: true },
    ]);
    setNewName("");
    setNewKey("");
  });

  const sorted = () => [...columns()].sort((a, b) => a.sort_order - b.sort_order);

  const updateCol = (localId: string, patch: Partial<PackColumnDraft>) => {
    setColumns((list) => list.map((c) => (c.localId === localId ? { ...c, ...patch } : c)));
  };

  const moveCol = (localId: string, dir: -1 | 1) => {
    const list = sorted();
    const idx = list.findIndex((c) => c.localId === localId);
    const swap = list[idx + dir];
    if (!swap || idx < 0) return;
    const a = list[idx];
    updateCol(a.localId, { sort_order: swap.sort_order });
    updateCol(swap.localId, { sort_order: a.sort_order });
  };

  const removeCol = (localId: string) => {
    if (columns().length <= 1) {
      toast.warning("Keep at least one column.");
      return;
    }
    setColumns((list) => list.filter((c) => c.localId !== localId));
  };

  const addCol = () => {
    const label = newName().trim();
    if (!label) {
      toast.warning("Column name is required.");
      return;
    }
    let key = (newKey().trim() || slugKey(label)).toLowerCase();
    if (columns().some((c) => c.key === key)) {
      key = `${key}_${columns().length + 1}`;
    }
    const maxOrder = columns().reduce((m, c) => Math.max(m, c.sort_order), -10);
    setColumns((list) => [
      ...list,
      { localId: nextLocalId(), key, name: label, sort_order: maxOrder + 10, color: "", is_done: false },
    ]);
    setNewName("");
    setNewKey("");
  };

  const save = async () => {
    const pack = props.pack;
    if (!pack?.id || pack.id <= 0) return;
    if (!props.canEdit) {
      props.onClose();
      return;
    }
    const packName = name().trim();
    if (!packName) {
      toast.warning("Pack name is required.");
      return;
    }
    const cols = sorted();
    if (cols.length === 0) {
      toast.warning("Add at least one column.");
      return;
    }
    for (const c of cols) {
      if (!c.name.trim() || !c.key.trim()) {
        toast.warning("Each column needs a key and name.");
        return;
      }
    }
    setSaving(true);
    const res = await patchPack(pack.id, {
      pack_name: packName,
      description: description().trim(),
      columns: cols.map((c, i) => ({
        key: c.key.trim(),
        name: c.name.trim(),
        sort_order: i * 10,
        color: c.color?.trim() || undefined,
        is_done: Boolean(c.is_done),
      })),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save pack.");
      return;
    }
    toast.success("Pack updated.");
    props.onSaved();
    props.onClose();
  };

  return (
    <WideEntityModal
      open={props.open && props.pack != null}
      title={props.canEdit ? `Edit pack — ${props.pack?.pack_name ?? ""}` : `View pack — ${props.pack?.pack_name ?? ""}`}
      onClose={props.onClose}
      onSave={props.canEdit ? () => void save() : undefined}
      saving={saving()}
      readOnly={!props.canEdit}
    >
      <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Pack code">
          <input class={inputClass} value={props.pack?.pack_code ?? ""} readOnly />
        </Field>
        <Field label="Source">
          <input
            class={inputClass}
            value={props.pack?.is_system ? "Platform (read-only)" : "Tenant"}
            readOnly
          />
        </Field>
        <Field label="Pack name" span="full">
          <input
            class={inputClass}
            value={name()}
            disabled={!props.canEdit}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </Field>
        <Field label="Description / summary" span="full">
          <textarea
            class={inputClass}
            rows={3}
            value={description()}
            disabled={!props.canEdit}
            placeholder="Shown when choosing a pack for a new workspace"
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
      </div>

      <div class="mt-6">
        <h3 class="mb-2 text-sm font-semibold text-text-primary">Kanban columns</h3>
        <p class="mb-3 text-xs text-text-secondary">
          These columns are applied when a workspace is created from this pack (or when you apply the pack to an empty board).
        </p>
        <div class="space-y-2">
          <For each={sorted()}>
            {(col) => (
              <div class="flex flex-wrap items-center gap-2 rounded-lg border border-stroke bg-slate-50 px-3 py-2">
                <input
                  class={`${inputClass} w-28 shrink-0`}
                  value={col.key}
                  disabled={!props.canEdit}
                  title="Column key"
                  onInput={(e) => updateCol(col.localId, { key: e.currentTarget.value.toLowerCase().replace(/\s+/g, "_") })}
                />
                <input
                  class={`${inputClass} min-w-[10rem] flex-1`}
                  value={col.name}
                  disabled={!props.canEdit}
                  onInput={(e) => updateCol(col.localId, { name: e.currentTarget.value })}
                />
                <input
                  type="color"
                  class="h-9 w-10 cursor-pointer rounded border border-stroke bg-white"
                  value={col.color && /^#[0-9a-fA-F]{6}$/.test(col.color) ? col.color : "#94a3b8"}
                  disabled={!props.canEdit}
                  title="Color"
                  onInput={(e) => updateCol(col.localId, { color: e.currentTarget.value })}
                />
                <label class="flex items-center gap-1 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(col.is_done)}
                    disabled={!props.canEdit}
                    onChange={() => updateCol(col.localId, { is_done: !col.is_done })}
                  />
                  Done
                </label>
                <Show when={props.canEdit}>
                  <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => moveCol(col.localId, -1)}>
                    Up
                  </button>
                  <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => moveCol(col.localId, 1)}>
                    Down
                  </button>
                  <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeCol(col.localId)}>
                    Remove
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>

        <Show when={props.canEdit}>
          <div class="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stroke p-3">
            <Field label="New column name">
              <input
                class={inputClass}
                value={newName()}
                placeholder="e.g. Review"
                onInput={(e) => {
                  setNewName(e.currentTarget.value);
                  if (!newKey().trim()) setNewKey(slugKey(e.currentTarget.value));
                }}
              />
            </Field>
            <Field label="Key">
              <input
                class={inputClass}
                value={newKey()}
                placeholder="review"
                onInput={(e) => setNewKey(e.currentTarget.value.toLowerCase().replace(/\s+/g, "_"))}
              />
            </Field>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={addCol}
            >
              + Add column
            </button>
          </div>
        </Show>

        <div class="mt-4 flex flex-wrap gap-2">
          <For each={sorted()}>
            {(col) => (
              <span
                class="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ "background-color": col.color || "#64748b" }}
              >
                {col.name}
                {col.is_done ? " ✓" : ""}
              </span>
            )}
          </For>
        </div>
      </div>
    </WideEntityModal>
  );
}
