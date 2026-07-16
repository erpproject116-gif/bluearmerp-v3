import { createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";

type Project = { id: number; project_code: string; project_name: string; status: string; custom_values?: Record<string, unknown> };

export default function ProjectsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("project_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Project | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({ project_name: "", status: "active" });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.projects);

  const list = useInventoryList<Project>("projects", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/projects/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({ project_name: "", status: "active" });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Project) => {
    setEditing(row);
    setNextCode(row.project_code);
    setForm({ project_name: row.project_name, status: row.status });
    loadCustom(row.custom_values ?? {});
    setModalOpen(true);
  };

  const save = async () => {
    const ed = editing();
    const clientError =
      requireFields(form(), buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    setSaving(true);
    const payload = { ...form(), custom_values: customValues() };
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/inventory/projects/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) }, { silent: true })
          : apiFetch("/api/v1/inventory/projects", { method: "POST", body: JSON.stringify(payload) }, { silent: true }),
      toast,
      ed ? "Project updated." : "Project created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("projects");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "project_code", header: "Code", clickable: true },
          { key: "project_name", header: "Name", clickable: true },
          { key: "status", header: "Status" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="inventory" targetType="inv_project" targetId={r.id} title={`History — ${r.project_code}`} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="project_code"
        nameKey="project_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search by code or name…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        settingsHref={INVENTORY_SETTINGS_HREF.projects}
      />
      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit project" : "New project"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="inv_project"
            targetId={editing()?.id}
            title={`History — ${editing()?.project_code ?? "Project"}`}
          />
        }
      >
        <Field label="Project code"><input class={inputClass} value={nextCode()} readOnly /></Field>
        <ModalField settings={byKey} fieldKey="project_name" fallbackLabel="Project name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().project_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, project_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="status" fallbackLabel="Status" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={form().status}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, status: e.currentTarget.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </ModalField>
        <CustomFieldsSection entityType={INVENTORY_ENTITY.projects} values={customValues} onChange={setCustom} />
      </EntityModal>
    </div>
  );
}
