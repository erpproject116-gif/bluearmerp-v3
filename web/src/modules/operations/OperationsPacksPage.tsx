import { A } from "@solidjs/router";
import { createMemo, createSignal, Show } from "solid-js";
import { EntityModal, Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import {
  clonePack,
  createPack,
  deletePack,
  useIndustryPacks,
  useInvalidatePacks,
  type IndustryPack,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";

type PackRow = IndustryPack & { id: number };

export default function OperationsPacksPage() {
  const auth = useAuth();
  const toast = useToast();
  const packs = useIndustryPacks();
  const invalidate = useInvalidatePacks();
  const canWrite = () => hasPermission(auth.me, "operations.packs", "write");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [code, setCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [colTodo, setColTodo] = createSignal("To Do");
  const [colDoing, setColDoing] = createSignal("In Progress");
  const [colDone, setColDone] = createSignal("Done");

  const rows = createMemo((): PackRow[] =>
    (packs.data ?? []).map((p, i) => ({
      ...p,
      id: p.id && p.id > 0 ? p.id : -(i + 1),
    })),
  );
  const selected = createMemo(() => rows().find((p) => p.id === selectedId()) ?? null);
  const selectedDbId = createMemo(() => {
    const s = selected();
    return s && s.id > 0 ? s.id : null;
  });

  const cloneSelected = async () => {
    const id = selectedDbId();
    if (!id) {
      toast.warning("Select a catalog pack (run migration 155 so packs load from the database).");
      return;
    }
    const pack = selected()!;
    setSaving(true);
    const res = await clonePack(id, {
      pack_code: `${pack.pack_code}_custom`,
      pack_name: `${pack.pack_name} (custom)`,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not clone pack.");
      return;
    }
    toast.success("Pack cloned — edit it from your tenant packs.");
    invalidate();
  };

  const removeSelected = async () => {
    const id = selectedDbId();
    const pack = selected();
    if (!id || !pack) return;
    if (pack.is_system) {
      toast.warning("System packs cannot be deleted. Clone them first.");
      return;
    }
    if (!window.confirm(`Delete pack “${pack.pack_name}”?`)) return;
    const res = await deletePack(id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete pack.");
      return;
    }
    setSelectedId(null);
    toast.success("Pack deleted.");
    invalidate();
  };

  const createBlank = async () => {
    const packCode = code().trim().toLowerCase();
    const packName = name().trim();
    if (!packCode || !packName) {
      toast.warning("Pack code and name are required.");
      return;
    }
    setSaving(true);
    const res = await createPack({
      pack_code: packCode,
      pack_name: packName,
      columns: [
        { key: "todo", name: colTodo().trim() || "To Do", sort_order: 0 },
        { key: "doing", name: colDoing().trim() || "In Progress", sort_order: 10 },
        { key: "done", name: colDone().trim() || "Done", sort_order: 20, is_done: true },
      ],
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create pack.");
      return;
    }
    setCreateOpen(false);
    setCode("");
    setName("");
    toast.success("Custom pack created.");
    invalidate();
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Industry packs</h2>
          <p class="text-sm text-text-secondary">
            Platform starters plus your tenant packs. Clone a system pack or create a blank one, then use it when creating a workspace.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A href="/app/operations" class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50">
            Back to hub
          </A>
          <Show when={canWrite()}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={saving() || !selectedDbId()}
              onClick={() => void cloneSelected()}
            >
              Clone selected
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              disabled={!selectedDbId() || !!selected()?.is_system}
              onClick={() => void removeSelected()}
            >
              Delete selected
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => setCreateOpen(true)}
            >
              + Custom pack
            </button>
          </Show>
        </div>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "pack_name", header: "Name" },
          { key: "pack_code", header: "Code" },
          {
            key: "is_system",
            header: "Source",
            render: (r) => (r.is_system ? "Platform" : "Tenant"),
            sortable: false,
          },
          { key: "summary", header: "Summary", render: (r) => r.summary ?? "—" },
        ]}
        rows={rows()}
        loading={packs.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => undefined}
        onNew={() => setCreateOpen(true)}
        codeKey="pack_code"
        nameKey="pack_name"
        page={1}
        pageSize={100}
        total={rows().length}
        onPageChange={() => undefined}
        search=""
        onSearchChange={() => undefined}
        onRefresh={invalidate}
      />

      <EntityModal
        open={createOpen()}
        title="New custom industry pack"
        onClose={() => setCreateOpen(false)}
        onSave={() => void createBlank()}
        saving={saving()}
      >
        <Field label="Pack code">
          <input class={inputClass} placeholder="my_fitout" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </Field>
        <Field label="Pack name">
          <input class={inputClass} placeholder="Fit-out delivery" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <p class="mb-2 text-xs text-text-secondary">Starter columns (refine on a workspace, then Save as pack).</p>
        <Field label="Column 1 name">
          <input class={inputClass} value={colTodo()} onInput={(e) => setColTodo(e.currentTarget.value)} />
        </Field>
        <Field label="Column 2 name">
          <input class={inputClass} value={colDoing()} onInput={(e) => setColDoing(e.currentTarget.value)} />
        </Field>
        <Field label="Column 3 name (done)">
          <input class={inputClass} value={colDone()} onInput={(e) => setColDone(e.currentTarget.value)} />
        </Field>
      </EntityModal>

      <Show when={selected()}>
        {(pack) => (
          <div class="mt-4 rounded-xl border border-stroke bg-white p-4 text-sm">
            <p class="font-medium text-text-primary">{pack().pack_name}</p>
            <p class="text-text-secondary">{pack().summary}</p>
            <Show when={pack().id > 0}>
              <p class="mt-1 text-xs text-text-secondary">Id: {pack().id}</p>
            </Show>
          </div>
        )}
      </Show>
    </OperationsLayout>
  );
}
