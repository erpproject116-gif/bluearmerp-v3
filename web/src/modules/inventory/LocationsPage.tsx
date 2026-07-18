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
import { useMasterLifecycle } from "../../shared/masterLifecycle";
import { hasPermission, useAuth } from "../../shared/auth-context";

type Location = {
  id: number;
  location_code: string;
  location_name: string;
  location_type: string;
  production_process: string;
  status: string;
  custom_values?: Record<string, unknown>;
};

export default function LocationsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("location_code");
  const auth = useAuth();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Location | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({ location_name: "", location_type: "location", production_process: "bundle", status: "active" });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const lifecycle = useMasterLifecycle({
    apiBase: "/api/v1/inventory/locations",
    entityLabel: "location",
    canManage: () => hasPermission(auth.me, "inventory.locations", "write"),
    onChanged: () => invalidate("locations"),
  });
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.locations);

  const list = useInventoryList<Location>("locations", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/locations/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({ location_name: "", location_type: "location", production_process: "bundle", status: "active" });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Location) => {
    setEditing(row);
    setNextCode(row.location_code);
    setForm({ location_name: row.location_name, location_type: row.location_type, production_process: row.production_process, status: row.status });
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
          ? apiFetch(`/api/v1/inventory/locations/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) }, { silent: true })
          : apiFetch("/api/v1/inventory/locations", { method: "POST", body: JSON.stringify(payload) }, { silent: true }),
      toast,
      ed ? "Location updated." : "Location created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("locations");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "location_code", header: "Code", clickable: true },
          { key: "location_name", header: "Name", clickable: true },
          { key: "location_type", header: "Type" },
          { key: "production_process", header: "Production" },
          { key: "status", header: "Status" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="inventory" targetType="inv_location" targetId={r.id} title={`History — ${r.location_code}`} />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="location_code"
        nameKey="location_name"
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
        settingsHref={INVENTORY_SETTINGS_HREF.locations}
        toolbarExtra={
          <div class="flex flex-wrap items-end gap-2">
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
      />
      <lifecycle.BulkDialog />
      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit location" : "New location"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="inv_location"
            targetId={editing()?.id}
            title={`History — ${editing()?.location_code ?? "Location"}`}
          />
        }
      >
        <Field label="Location code"><input class={inputClass} value={nextCode()} readOnly /></Field>
        <ModalField settings={byKey} fieldKey="location_name" fallbackLabel="Location name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().location_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, location_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="location_type" fallbackLabel="Type" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={form().location_type}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, location_type: e.currentTarget.value }))}
            >
              <option value="location">Location</option>
              <option value="factory">Factory</option>
              <option value="factory_oe_manage">Factory (O/E manage)</option>
            </select>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="production_process" fallbackLabel="Production process" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={form().production_process}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, production_process: e.currentTarget.value }))}
            >
              <option value="bundle">Bundle</option>
              <option value="service">Service</option>
            </select>
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
        <CustomFieldsSection entityType={INVENTORY_ENTITY.locations} values={customValues} onChange={setCustom} />
      </EntityModal>
    </div>
  );
}
