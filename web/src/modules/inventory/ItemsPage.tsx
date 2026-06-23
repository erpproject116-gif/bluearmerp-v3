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

type Item = {
  id: number;
  item_code: string;
  item_name: string;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
  warranty_duration_months?: number | null;
  reorder_level?: number | null;
  status: string;
  custom_values?: Record<string, unknown>;
};

const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ItemsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("item_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Item | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({
    item_name: "",
    purchase_price: 0,
    sales_price: 0,
    vip_price: 0,
    warranty_duration_months: null as number | null,
    reorder_level: null as number | null,
    status: "active",
  });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.items);

  const list = useInventoryList<Item>("items", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/items/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({
      item_name: "",
      purchase_price: 0,
      sales_price: 0,
      vip_price: 0,
      warranty_duration_months: null,
      reorder_level: null,
      status: "active",
    });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Item) => {
    setEditing(row);
    setNextCode(row.item_code);
    setForm({
      item_name: row.item_name,
      purchase_price: row.purchase_price,
      sales_price: row.sales_price,
      vip_price: row.vip_price,
      warranty_duration_months: row.warranty_duration_months ?? null,
      reorder_level: row.reorder_level ?? null,
      status: row.status,
    });
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
          ? apiFetch(`/api/v1/inventory/items/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) })
          : apiFetch("/api/v1/inventory/items", { method: "POST", body: JSON.stringify(payload) }),
      toast,
      ed ? "Item updated." : "Item created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("items");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "item_code", header: "Code", clickable: true },
          { key: "item_name", header: "Name", clickable: true },
          { key: "purchase_price", header: "Purchase", render: (r) => money(r.purchase_price) },
          { key: "sales_price", header: "Sales", render: (r) => money(r.sales_price) },
          { key: "vip_price", header: "VIP", render: (r) => money(r.vip_price) },
          { key: "warranty_duration_months", header: "Warranty (mo)", render: (r) => r.warranty_duration_months ?? "—" },
          { key: "reorder_level", header: "Reorder", render: (r) => (r.reorder_level != null ? r.reorder_level : "—") },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="item_code"
        nameKey="item_name"
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
        itemsCsvImport
        onImportComplete={() => invalidate("items")}
        settingsHref={INVENTORY_SETTINGS_HREF.items}
      />
      <EntityModal open={modalOpen()} title={editing() ? "Edit item" : "New item"} onClose={() => setModalOpen(false)} onSave={() => void save()} saving={saving()}>
        <Field label="Item code"><input class={inputClass} value={nextCode()} readOnly /></Field>
        <ModalField settings={byKey} fieldKey="item_name" fallbackLabel="Item name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().item_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, item_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="purchase_price" fallbackLabel="Purchase price">
          {(m) => (
            <input
              type="number"
              step="0.01"
              class={inputClass}
              value={form().purchase_price}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, purchase_price: Number(e.currentTarget.value) }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="sales_price" fallbackLabel="Sales price">
          {(m) => (
            <input
              type="number"
              step="0.01"
              class={inputClass}
              value={form().sales_price}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, sales_price: Number(e.currentTarget.value) }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="vip_price" fallbackLabel="VIP price">
          {(m) => (
            <input
              type="number"
              step="0.01"
              class={inputClass}
              value={form().vip_price}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, vip_price: Number(e.currentTarget.value) }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="warranty_duration_months" fallbackLabel="Warranty (months)">
          {(m) => (
            <input
              type="number"
              min="0"
              step="1"
              class={inputClass}
              value={form().warranty_duration_months ?? ""}
              disabled={m.disabled}
              placeholder="No warranty"
              onInput={(e) => {
                const v = e.currentTarget.value;
                setForm((f) => ({
                  ...f,
                  warranty_duration_months: v === "" ? null : Number(v),
                }));
              }}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="reorder_level" fallbackLabel="Reorder level">
          {(m) => (
            <input
              type="number"
              min="0"
              step="0.0001"
              class={inputClass}
              value={form().reorder_level ?? ""}
              disabled={m.disabled}
              placeholder="Not set"
              onInput={(e) => {
                const v = e.currentTarget.value;
                setForm((f) => ({
                  ...f,
                  reorder_level: v === "" ? null : Number(v),
                }));
              }}
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
        <CustomFieldsSection entityType={INVENTORY_ENTITY.items} values={customValues} onChange={setCustom} />
      </EntityModal>
    </div>
  );
}
