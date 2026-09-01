import { createSignal, For } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { CustomFieldsSection, collectCustomFieldErrors } from "../../shared/CustomFieldsSection";
import { DRAFT_ENTITY, INVENTORY_ENTITY, INVENTORY_SETTINGS_HREF } from "../../shared/entityTypes";
import { collectRequiredFieldErrors, handleSaveResult } from "../../shared/handleSaveResult";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { mergeFormErrors } from "../../shared/formValidation";
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
  PHTIN_PLACEHOLDER,
  validatePartnerContact,
} from "../../shared/validation/phContact";

const PARTNER_FORM_ID = "partner-form";

const KIND_TABS = [
  { value: "", label: "All" },
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
] as const;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const kindFilter = () => {
    const k = String(searchParams.kind ?? "").toLowerCase();
    return k === "customer" || k === "vendor" ? k : "";
  };
  const setKindFilter = (kind: string) => {
    setSearchParams({ kind: kind || undefined }, { replace: true });
  };
  const pageTitle = () =>
    kindFilter() === "customer" ? "Customers" : kindFilter() === "vendor" ? "Vendors" : "Customers & vendors";
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
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string | undefined>>({});
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

  const fieldError = (key: string) => fieldErrors()[key];

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

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
    kind: kindFilter() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const openNew = async () => {
    const res = await apiFetch<{ next_code: string }>("/api/v1/inventory/partners/next-code");
    setNextCode(res.data?.next_code ?? "-----");
    setEditing(null);
    setForm({
      partner_kind: kindFilter() === "vendor" ? "vendor" : "customer",
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
    const validationErrors = mergeFormErrors(
      collectRequiredFieldErrors(form(), buildRequiredChecks(fields())),
      collectCustomFieldErrors(customValues(), activeCustomFields()),
      validatePartnerContact({
        mobile: form().mobile,
        phone: form().phone,
        email: form().email,
        tin: form().tin,
      }),
    );
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      toast.error(Object.values(validationErrors).find(Boolean) ?? "Check the highlighted fields.");
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
      const ok = handleSaveResult(res, toast, ed ? "Partner updated." : "Partner created.", {
        onFieldErrors: setFieldErrors,
      });
      if (!ok) {
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
      <div class="mb-3">
        <h1 class="text-lg font-semibold text-text-primary">{pageTitle()}</h1>
        <p class="text-sm text-text-secondary">
          Master list for people you sell to or buy from. Same records appear on Sales and Purchase.
        </p>
      </div>
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
            <label class="flex flex-col gap-1 text-xs font-medium text-text-primary">
              Show
              <select
                class={inputClass}
                value={kindFilter()}
                onChange={(e) => setKindFilter(e.currentTarget.value)}
              >
                <For each={KIND_TABS}>
                  {(tab) => <option value={tab.value}>{tab.label}</option>}
                </For>
              </select>
            </label>
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
      />
      <lifecycle.BulkDialog />
      <EntityModal
        open={modalOpen()}
        title={editing() ? `Edit ${form().partner_kind === "vendor" ? "vendor" : "customer"}` : `New ${kindFilter() === "vendor" ? "vendor" : "customer"}`}
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
        <FormErrorSummary errors={fieldErrors} />
        <draft.DraftBanner />
        <Field label="Customer/Vendor code">
          <input class={inputClass} value={nextCode()} readOnly />
        </Field>
        <ModalField
          settings={byKey}
          fieldKey="partner_kind"
          fallbackLabel="Kind"
          fallbackRequired
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <select
              {...m.inputProps}
              class={inputClass}
              value={form().partner_kind}
              disabled={m.disabled}
              onChange={(e) => {
                clearFieldError("partner_kind");
                setForm((f) => ({ ...f, partner_kind: e.currentTarget.value }));
              }}
            >
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="both">Both</option>
            </select>
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="company_name"
          fallbackLabel="Company name"
          fallbackRequired
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <input
              {...m.inputProps}
              class={inputClass}
              value={form().company_name}
              disabled={m.disabled}
              placeholder={m.placeholder}
              onInput={(e) => {
                clearFieldError("company_name");
                setForm((f) => ({ ...f, company_name: e.currentTarget.value }));
              }}
            />
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="ceo_name"
          fallbackLabel="CEO name"
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <input
              {...m.inputProps}
              class={inputClass}
              value={form().ceo_name}
              disabled={m.disabled}
              placeholder={m.placeholder}
              onInput={(e) => setForm((f) => ({ ...f, ceo_name: e.currentTarget.value }))}
            />
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="phone"
          fallbackLabel="Phone"
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <input
              {...m.inputProps}
              class={inputClass}
              value={form().phone}
              disabled={m.disabled}
              placeholder={m.placeholder ?? "(032) 123 4567"}
              onInput={(e) => {
                clearFieldError("phone");
                setForm((f) => ({ ...f, phone: e.currentTarget.value }));
              }}
            />
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="mobile"
          fallbackLabel="Mobile"
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <input
              {...m.inputProps}
              class={inputClass}
              value={form().mobile}
              disabled={m.disabled}
              placeholder={m.placeholder ?? "0917 123 4567"}
              onInput={(e) => {
                clearFieldError("mobile");
                setForm((f) => ({ ...f, mobile: e.currentTarget.value }));
              }}
            />
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="email"
          fallbackLabel="Email"
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <input
              {...m.inputProps}
              class={inputClass}
              value={form().email}
              disabled={m.disabled}
              placeholder={m.placeholder ?? "name@company.com"}
              onInput={(e) => {
                clearFieldError("email");
                setForm((f) => ({ ...f, email: e.currentTarget.value }));
              }}
            />
          )}
        </ModalField>
        <Field label="TIN (BIR 2307 payee)" error={fieldError("tin")} required={false}>
          <input
            class={inputClass}
            value={form().tin}
            placeholder={PHTIN_PLACEHOLDER}
            aria-invalid={fieldError("tin") ? true : undefined}
            onInput={(e) => {
              clearFieldError("tin");
              setForm((f) => ({ ...f, tin: e.currentTarget.value }));
            }}
          />
        </Field>
        <ModalField
          settings={byKey}
          fieldKey="address"
          fallbackLabel="Address"
          span="full"
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <textarea
              {...m.inputProps}
              class={inputClass}
              rows={2}
              value={form().address}
              disabled={m.disabled}
              placeholder={m.placeholder}
              onInput={(e) => {
                clearFieldError("address");
                setForm((f) => ({ ...f, address: e.currentTarget.value }));
              }}
            />
          )}
        </ModalField>
        <ModalField
          settings={byKey}
          fieldKey="status"
          fallbackLabel="Status"
          fallbackRequired
          formId={PARTNER_FORM_ID}
          errors={fieldErrors}
        >
          {(m) => (
            <select
              {...m.inputProps}
              class={inputClass}
              value={form().status}
              disabled={m.disabled}
              onChange={(e) => {
                clearFieldError("status");
                setForm((f) => ({ ...f, status: e.currentTarget.value }));
              }}
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
