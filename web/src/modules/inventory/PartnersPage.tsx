import { createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { requireFields, submitEntity } from "../../shared/handleSaveResult";
import { ModalField } from "../../shared/ModalField";
import { useToast } from "../../shared/toast";
import { useCustomValues } from "../../shared/useCustomValues";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";

export type Partner = {
  id: number;
  partner_code: string;
  partner_kind: string;
  company_name: string;
  ceo_name: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  status: string;
  custom_values?: Record<string, unknown>;
};

export default function PartnersPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("partner_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Partner | null>(null);
  const [nextCode, setNextCode] = createSignal("");
  const [form, setForm] = createSignal({
    partner_kind: "customer",
    company_name: "",
    ceo_name: "",
    phone: "",
    mobile: "",
    email: "",
    address: "",
    status: "active",
  });
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.partners);

  const list = useInventoryList<Partner>("partners", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/partners/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({
      partner_kind: "customer",
      company_name: "",
      ceo_name: "",
      phone: "",
      mobile: "",
      email: "",
      address: "",
      status: "active",
    });
    loadCustom({});
    setModalOpen(true);
  };

  const openEdit = (row: Partner) => {
    setEditing(row);
    setNextCode(row.partner_code);
    setForm({
      partner_kind: row.partner_kind,
      company_name: row.company_name,
      ceo_name: row.ceo_name ?? "",
      phone: row.phone ?? "",
      mobile: row.mobile ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
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
    const body = {
      ...form(),
      ceo_name: form().ceo_name || null,
      phone: form().phone || null,
      mobile: form().mobile || null,
      email: form().email || null,
      address: form().address || null,
      custom_values: customValues(),
    };
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/inventory/partners/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/inventory/partners", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Partner updated." : "Partner created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    invalidate("partners");
  };

  return (
    <div>
      <SpreadsheetGrid
        columns={[
          { key: "partner_code", header: "Code", clickable: true },
          { key: "partner_kind", header: "Kind" },
          { key: "company_name", header: "Company", clickable: true },
          { key: "ceo_name", header: "CEO" },
          { key: "phone", header: "Phone" },
          { key: "mobile", header: "Mobile" },
          { key: "email", header: "Email" },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={() => void openNew()}
        codeKey="partner_code"
        nameKey="company_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search by name, code, or email…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        onRefresh={() => invalidate("partners")}
        settingsHref={INVENTORY_SETTINGS_HREF.partners}
      />
      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit partner" : "New partner"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Field label="Customer/Vendor code">
          <input class={inputClass} value={nextCode()} readOnly />
        </Field>
        <ModalField settings={byKey} fieldKey="partner_kind" fallbackLabel="Kind" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={form().partner_kind}
              disabled={m.disabled}
              onChange={(e) => setForm((f) => ({ ...f, partner_kind: e.currentTarget.value }))}
            >
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="both">Both</option>
            </select>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="company_name" fallbackLabel="Company name" fallbackRequired>
          {(m) => (
            <input
              class={inputClass}
              value={form().company_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, company_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="ceo_name" fallbackLabel="CEO name">
          {(m) => (
            <input
              class={inputClass}
              value={form().ceo_name}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, ceo_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="phone" fallbackLabel="Phone">
          {(m) => (
            <input
              class={inputClass}
              value={form().phone}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="mobile" fallbackLabel="Mobile">
          {(m) => (
            <input
              class={inputClass}
              value={form().mobile}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, mobile: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="email" fallbackLabel="Email">
          {(m) => (
            <input
              class={inputClass}
              value={form().email}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="address" fallbackLabel="Address" span="full">
          {(m) => (
            <textarea
              class={inputClass}
              rows={2}
              value={form().address}
              disabled={m.disabled}
              onInput={(e) => setForm((f) => ({ ...f, address: e.currentTarget.value }))}
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
        <CustomFieldsSection
          entityType={INVENTORY_ENTITY.partners}
          values={customValues}
          onChange={setCustom}
        />
      </EntityModal>
    </div>
  );
}
