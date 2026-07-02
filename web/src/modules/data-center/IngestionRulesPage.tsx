import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";
import { DataCenterLayout } from "./DataCenterLayout";

type IngestionRule = {
  id: number;
  name: string;
  target_entity: string;
  match_fields: unknown;
  active: boolean;
  updated_at: string;
};

const TARGET_ENTITIES = ["purchase_order", "sales_order", "supplier_invoice", "journal_entry"];

export default function IngestionRulesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [name, setName] = createSignal("");
  const [targetEntity, setTargetEntity] = createSignal(TARGET_ENTITIES[0]);
  const [matchFieldsJson, setMatchFieldsJson] = createSignal("[]");
  const [active, setActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["data-center-ingestion-rules"],
    queryFn: async () => {
      const res = await apiFetch<IngestionRule[]>("/api/v1/data-center/ingestion-rules");
      if (!res.success) throw new Error(res.message ?? "Failed to load rules");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["data-center-ingestion-rules"] });

  const openNew = () => {
    setEditingId(null);
    setName("");
    setTargetEntity(TARGET_ENTITIES[0]);
    setMatchFieldsJson("[]");
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (row: IngestionRule) => {
    setEditingId(row.id);
    setName(row.name);
    setTargetEntity(row.target_entity);
    setMatchFieldsJson(JSON.stringify(row.match_fields ?? [], null, 2));
    setActive(row.active);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    let matchFields: unknown;
    try {
      matchFields = JSON.parse(matchFieldsJson());
    } catch {
      toast.warning("Match fields must be valid JSON.");
      return;
    }
    setSaving(true);
    const body = {
      name: name().trim(),
      target_entity: targetEntity(),
      match_fields: matchFields,
      active: active(),
    };
    const res = editingId()
      ? await apiFetch(`/api/v1/data-center/ingestion-rules/${editingId()}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await apiFetch("/api/v1/data-center/ingestion-rules", {
          method: "POST",
          body: JSON.stringify(body),
        });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save rule.");
      return;
    }
    toast.success(editingId() ? "Rule updated." : "Rule created.");
    setModalOpen(false);
    invalidate();
  };

  const remove = async (row: IngestionRule) => {
    if (!confirm(`Delete rule "${row.name}"?`)) return;
    const res = await apiFetch(`/api/v1/data-center/ingestion-rules/${row.id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to delete rule.");
      return;
    }
    toast.success("Rule deleted.");
    invalidate();
  };

  return (
    <DataCenterLayout>
      <SpreadsheetGrid<IngestionRule>
        columns={[
          { key: "name", header: "Name", clickable: true },
          { key: "target_entity", header: "Target entity" },
          {
            key: "active",
            header: "Active",
            sortable: false,
            render: (r) => (r.active ? "Yes" : "No"),
          },
          { key: "updated_at", header: "Updated" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-xs text-red-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(r);
                }}
              >
                Delete
              </button>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={openEdit}
        settingsHref="/app/data-center/ingestion-rules"
        codeKey="name"
        nameKey="name"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title={editingId() ? "Edit ingestion rule" : "New ingestion rule"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Name *">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Target entity *">
          <select class={inputClass} value={targetEntity()} onChange={(e) => setTargetEntity(e.currentTarget.value)}>
            {TARGET_ENTITIES.map((t) => (
              <option value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>
        <Field label="Match fields (JSON)">
          <textarea
            class={inputClass}
            rows={4}
            value={matchFieldsJson()}
            onInput={(e) => setMatchFieldsJson(e.currentTarget.value)}
          />
        </Field>
        <Field label="Active">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active()} onChange={(e) => setActive(e.currentTarget.checked)} />
            Rule is active
          </label>
        </Field>
      </EntityModal>
    </DataCenterLayout>
  );
}
