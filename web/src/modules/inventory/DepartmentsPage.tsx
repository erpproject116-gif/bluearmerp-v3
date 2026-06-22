import { createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { ModalField } from "../../shared/ModalField";
import { useCustomValues } from "../../shared/useCustomValues";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";

type Department = { id: number; department_code: string; department_name: string; status: string; custom_values?: Record<string, unknown> };

export default function DepartmentsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("department_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Department | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({ department_name: "", status: "active" });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.departments);

  const list = useInventoryList<Department>("departments", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/departments/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({ department_name: "", status: "active" });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Department) => {
    setEditing(row);
    setNextCode(row.department_code);
    setForm({ department_name: row.department_name, status: row.status });
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
          ? apiFetch(`/api/v1/inventory/departments/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) })
          : apiFetch("/api/v1/inventory/departments", { method: "POST", body: JSON.stringify(payload) }),
      toast,
      ed ? "Department updated." : "Department created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("departments");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "department_code", header: "Code", clickable: true },
          { key: "department_name", header: "Name", clickable: true },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="department_code"
        nameKey="department_name"
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
        settingsHref={INVENTORY_SETTINGS_HREF.departments}
      />
      <EntityModal open={modalOpen()} title={editing() ? "Edit department" : "New department"} onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()}>
        <Field label="Dept. code"><input class={inputClass} value={nextCode()} readOnly /></Field>
        <ModalField settings={byKey} fieldKey="department_name" fallbackLabel="Department name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().department_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, department_name: e.currentTarget.value }))}
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
        <CustomFieldsSection entityType={INVENTORY_ENTITY.departments} values={customValues} onChange={setCustom} />
      </EntityModal>
    </div>
  );
}
