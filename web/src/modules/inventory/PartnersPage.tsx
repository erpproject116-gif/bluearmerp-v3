import { createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { DRAFT_ENTITY, INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { requireFields, handleSaveResult } from "../../shared/handleSaveResult";
import { ModalField } from "../../shared/ModalField";
import { useToast } from "../../shared/toast";
import { useCustomValues } from "../../shared/useCustomValues";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useInventoryList, useInvalidateInventoryList } from "../../shared/useInventoryList";
import { useListState } from "../../shared/useListState";
import { useMasterLifecycle } from "../../shared/masterLifecycle";
import { hasPermission, useAuth } from "../../shared/auth-context";
import {
  buildPartnerContactPayload,
  validatePartnerContact,
  type PartnerContactErrors,
} from "../../shared/validation/phContact";

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
  tin: string | null;
  status: string;
  credit_limit?: number | null;
  credit_limit_on_hold?: boolean;
  default_price_list_id?: number | null;
  custom_values?: Record<string, unknown>;
};

export default function PartnersPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("partner_code");
  const auth = useAuth();
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
    tin: "",
    status: "active",
    credit_limit: "",
    credit_limit_on_hold: false,
    default_price_list_id: "",
  });
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<PartnerContactErrors>({});
  const toast = useToast();
  const invalidate = useInvalidateInventoryList();
  const lifecycle = useMasterLifecycle({
    apiBase: "/api/v1/inventory/partners",
    entityLabel: "partner",
    canManage: () => hasPermission(auth.me, "inventory.partners", "write"),
    onChanged: () => invalidate("partners"),
  });
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { byKey, fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.partners);

  const fieldError = (key: keyof PartnerContactErrors) => fieldErrors()[key];

  const priceLists = createQuery(() => ({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; name: string; is_selling: boolean }[]>("/api/v1/inventory/price-lists");
      if (!res.success) return [];
      return (res.data ?? []).filter((pl) => pl.is_selling);
    },
  }));

  const list = useInventoryList<Partner>("partners", () => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
    lifecycle: lifecycle.filter(),
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
      tin: "",
      status: "active",
      credit_limit: "",
      credit_limit_on_hold: false,
      default_price_list_id: "",
    });
    loadCustom({});
    setFieldErrors({});
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
      tin: row.tin ?? "",
      status: row.status,
      credit_limit: row.credit_limit != null ? String(row.credit_limit) : "",
      credit_limit_on_hold: row.credit_limit_on_hold ?? false,
      default_price_list_id: row.default_price_list_id != null ? String(row.default_price_list_id) : "",
    });
    loadCustom(row.custom_values ?? {});
    setFieldErrors({});
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.invPartner,
    draftKey: () => (editing() ? `edit-${editing()!.id}` : "new"),
    getPayload: () => ({ ...form(), custom_values: customValues() }),
    onApply: (payload) => {
      const { custom_values, ...rest } = payload as ReturnType<typeof form> & { custom_values?: Record<string, unknown> };
      setForm((f) => ({ ...f, ...rest }));
      if (custom_values) loadCustom(custom_values);
    },
    enabled: () => modalOpen(),
    // openNew() awaits a next-code fetch before the modal's initial state settles, so
    // autoApply could race with it — prefer the Restore banner over a silent overwrite.
  });

  const save = async () => {
    setFieldErrors({});
    const ed = editing();
    const clientError =
      requireFields(form(), buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    const contactErrors = validatePartnerContact({
      mobile: form().mobile,
      phone: form().phone,
      email: form().email,
      tin: form().tin,
    });
    if (Object.keys(contactErrors).length > 0) {
      setFieldErrors(contactErrors);
      toast.error(Object.values(contactErrors)[0] ?? "Check the highlighted fields.");
      return;
    }
    if (clientError) {
      toast.error(clientError);
      return;
    }

    setSaving(true);
    const creditLimitRaw = form().credit_limit.trim();
    const creditLimit = creditLimitRaw === "" ? null : Number(creditLimitRaw);
    const plRaw = form().default_price_list_id.trim();
    const defaultPriceListId = plRaw === "" ? null : Number(plRaw);
    const contactPayload = buildPartnerContactPayload({
      mobile: form().mobile,
      phone: form().phone,
      email: form().email,
      tin: form().tin,
    });
    const body = {
      ...form(),
      ceo_name: form().ceo_name || null,
      ...contactPayload,
      address: form().address || null,
      credit_limit: creditLimit != null && Number.isFinite(creditLimit) ? creditLimit : null,
      credit_limit_on_hold: form().credit_limit_on_hold,
      default_price_list_id: defaultPriceListId != null && Number.isFinite(defaultPriceListId) ? defaultPriceListId : null,
      custom_values: customValues(),
    };
    try {
      const res = await (ed
        ? apiFetch(`/api/v1/inventory/partners/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
        : apiFetch("/api/v1/inventory/partners", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
      const ok = handleSaveResult(res, toast, ed ? "Partner updated." : "Partner created.");
      if (!ok) {
        if (res.errors) {
          setFieldErrors({
            mobile: res.errors.mobile,
            phone: res.errors.phone,
            email: res.errors.email,
            tin: res.errors.tin,
          });
        }
        return;
      }
      await draft.clearOnSave();
      setModalOpen(false);
      invalidate("partners");
    } catch {
      toast.error("Could not reach the API. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
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
          { key: "tin", header: "TIN" },
          {
            key: "credit_limit",
            header: "Credit limit",
            render: (r) => <span>{r.credit_limit != null ? r.credit_limit : "—"}</span>,
          },
          {
            key: "credit_limit_on_hold",
            header: "On hold",
            render: (r) => <span>{r.credit_limit_on_hold ? "Yes" : "No"}</span>,
          },
          { key: "status", header: "Status" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink module="inventory" targetType="inv_partner" targetId={r.id} title={`History — ${r.partner_code}`} />
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
        title={editing() ? "Edit partner" : "New partner"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="inv_partner"
            targetId={editing()?.id}
            title={`History — ${editing()?.partner_code ?? "Partner"}`}
          />
        }
      >
        <ModalFormGuide guideId="partner" spanFull />
        <draft.DraftBanner />
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
            <>
              <input
                class={inputClass}
                value={form().phone}
                disabled={m.disabled}
                placeholder="(032) 123 4567"
                onInput={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))}
              />
              <Show when={fieldError("phone")}>
                <p class="mt-1 text-xs text-red-600">{fieldError("phone")}</p>
              </Show>
            </>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="mobile" fallbackLabel="Mobile">
          {(m) => (
            <>
              <input
                class={inputClass}
                value={form().mobile}
                disabled={m.disabled}
                placeholder="0917 123 4567"
                onInput={(e) => setForm((f) => ({ ...f, mobile: e.currentTarget.value }))}
              />
              <Show when={fieldError("mobile")}>
                <p class="mt-1 text-xs text-red-600">{fieldError("mobile")}</p>
              </Show>
            </>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="email" fallbackLabel="Email">
          {(m) => (
            <>
              <input
                class={inputClass}
                value={form().email}
                disabled={m.disabled}
                placeholder="name@company.com"
                onInput={(e) => setForm((f) => ({ ...f, email: e.currentTarget.value }))}
              />
              <Show when={fieldError("email")}>
                <p class="mt-1 text-xs text-red-600">{fieldError("email")}</p>
              </Show>
            </>
          )}
        </ModalField>
        <Field label="TIN (BIR 2307 payee)">
          <input
            class={inputClass}
            value={form().tin}
            placeholder="000-000-000-000"
            onInput={(e) => setForm((f) => ({ ...f, tin: e.currentTarget.value }))}
          />
          <Show when={fieldError("tin")}>
            <p class="mt-1 text-xs text-red-600">{fieldError("tin")}</p>
          </Show>
        </Field>
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
        <Field label="Default price list">
          <select
            class={inputClass}
            value={form().default_price_list_id}
            onChange={(e) => setForm((f) => ({ ...f, default_price_list_id: e.currentTarget.value }))}
          >
            <option value="">— None —</option>
            {(priceLists.data ?? []).map((pl) => (
              <option value={String(pl.id)}>{pl.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Credit limit">
          <input
            class={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={form().credit_limit}
            onInput={(e) => setForm((f) => ({ ...f, credit_limit: e.currentTarget.value }))}
            placeholder="Leave blank for no limit"
          />
        </Field>
        <Field label="Credit on hold">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form().credit_limit_on_hold}
              onChange={(e) => setForm((f) => ({ ...f, credit_limit_on_hold: e.currentTarget.checked }))}
            />
            Block new sales when credit limit is enforced
          </label>
        </Field>
        <CustomFieldsSection
          entityType={INVENTORY_ENTITY.partners}
          values={customValues}
          onChange={setCustom}
        />
      </EntityModal>
    </div>
  );
}
