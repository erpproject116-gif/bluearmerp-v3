import { createEffect, createSignal } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_ENTITY, QUOTATION_SETTINGS_HREF } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { useListState } from "../../../shared/useListState";
import { useCurrencyList, useInvalidateCurrencies, type CurrencyRow } from "../../../shared/useCurrencyList";
import { apiFetch } from "../../../shared/api";
import { QuotationLayout } from "../QuotationLayout";

export type CurrencyDetail = CurrencyRow;

export function CurrencyModal(props: {
  open: boolean;
  editing: CurrencyDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { fields } = useFormFieldSettings(QUOTATION_ENTITY.currency);
  const [saving, setSaving] = createSignal(false);
  const [currencyCode, setCurrencyCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [isDefault, setIsDefault] = createSignal(false);
  const [status, setStatus] = createSignal("active");

  createEffect(() => {
    if (!props.open) return;
    const ed = props.editing;
    if (ed) {
      setCurrencyCode(ed.currency_code);
      setName(ed.name);
      setIsDefault(ed.is_default);
      setStatus(ed.status);
    } else {
      setCurrencyCode("");
      setName("");
      setIsDefault(false);
      setStatus("active");
    }
  });

  const save = async () => {
    const form = { currency_code: currencyCode(), name: name(), status: status() };
    const clientError = requireFields(form, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const body = {
      currency_code: currencyCode(),
      name: name(),
      is_default: isDefault(),
      status: status(),
    };
    setSaving(true);
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/quotation/currencies/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/quotation/currencies", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Currency updated." : "Currency created.",
    );
    setSaving(false);
    if (!ok) return;
    props.onSaved();
    props.onClose();
  };

  return (
    <EntityModal
      open={props.open}
      title={props.editing ? "Edit Currency" : "New Currency"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
    >
      <Field label="Currency code *">
        <input class={inputClass} value={currencyCode()} onInput={(e) => setCurrencyCode(e.currentTarget.value.toUpperCase())} />
      </Field>
      <Field label="Name *">
        <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </Field>
      <Field label="Default">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault()} onChange={(e) => setIsDefault(e.currentTarget.checked)} />
          Set as default currency
        </label>
      </Field>
      <Field label="Status">
        <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
    </EntityModal>
  );
}

export default function CurrencyListPage() {
  const invalidate = useInvalidateCurrencies();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("name");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<CurrencyDetail | null>(null);

  const list = useCurrencyList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  return (
    <QuotationLayout>
      <SpreadsheetGrid
        columns={[
          { key: "currency_code", header: "Code", clickable: true },
          { key: "name", header: "Name", clickable: true },
          { key: "is_default", header: "Default", render: (r) => (r.is_default ? "Yes" : "") },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={(row) => {
          setEditing(row);
          setModalOpen(true);
        }}
        onNew={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        codeKey="currency_code"
        nameKey="name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search name or code…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        onRefresh={invalidate}
        settingsHref={QUOTATION_SETTINGS_HREF.currency}
      />
      <CurrencyModal open={modalOpen()} editing={editing()} onClose={() => setModalOpen(false)} onSaved={invalidate} />
    </QuotationLayout>
  );
}
