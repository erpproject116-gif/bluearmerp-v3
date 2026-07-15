import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";

type CapaRecord = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
};

export default function CapaPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [dueDate, setDueDate] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["capa-records"],
    queryFn: async () => {
      const res = await apiFetch<CapaRecord[]>("/api/v1/quality/capa");
      if (!res.success) throw new Error(res.message ?? "Failed to load CAPA");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const openNew = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.qaCapa,
    draftKey: "new",
    getPayload: () => ({ title: title(), description: description(), due_date: dueDate() }),
    onApply: (payload) => {
      setTitle(payload.title);
      setDescription(payload.description);
      setDueDate(payload.due_date);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen(),
  });

  const save = async () => {
    if (!title().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CapaRecord>("/api/v1/quality/capa", {
      method: "POST",
      body: JSON.stringify({
        title: title().trim(),
        description: description().trim() || null,
        due_date: dueDate().trim() || null,
        status: "open",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create CAPA.");
      return;
    }
    toast.success("CAPA record created.");
    await draft.clearOnSave();
    setModalOpen(false);
    void client.invalidateQueries({ queryKey: ["capa-records"] });
  };

  return (
    <div class="space-y-4">
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">CAPA — corrective actions</h2>
        <p class="mt-1 text-sm text-text-secondary">QMS depth beyond NCR logging — track open corrective actions.</p>
      </section>
      <SpreadsheetGrid<CapaRecord>
        columns={[
          { key: "title", header: "Title", clickable: true },
          { key: "due_date", header: "Due date" },
          { key: "status", header: "Status", render: (r) => <span class="capitalize">{r.status}</span> },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="title"
        nameKey="title"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={() => void client.invalidateQueries({ queryKey: ["capa-records"] })}
      />
      <EntityModal open={modalOpen()} title="New CAPA" onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()} singleColumn>
        <draft.DraftBanner />
        <Field label="Title *">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Description">
          <textarea class={inputClass} rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <input class={inputClass} type="date" value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </div>
  );
}
