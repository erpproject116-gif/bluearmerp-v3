import { createEffect, createSignal } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_ENTITY, QUOTATION_SETTINGS_HREF } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { useListState } from "../../../shared/useListState";
import { useInvalidateTaxTypes, useTaxTypeList, type TaxTypeRow } from "../../../shared/useTaxTypeList";
import { apiFetch } from "../../../shared/api";
import { QuotationLayout } from "../QuotationLayout";

export type TaxTypeDetail = TaxTypeRow;

export function TaxTypeModal(props: {
  open: boolean;
  editing: TaxTypeDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { fields } = useFormFieldSettings(QUOTATION_ENTITY.taxType);
  const [saving, setSaving] = createSignal(false);
  const [taxCode, setTaxCode] = createSignal("");
  const [name, setName] = createSignal("");
  const [taxMode, setTaxMode] = createSignal("included");
  const [ratePercent, setRatePercent] = createSignal("12");
  const [sortOrder, setSortOrder] = createSignal("0");
  const [status, setStatus] = createSignal("active");

  createEffect(() => {
    if (!props.open) return;
    const ed = props.editing;
    if (ed) {
      setTaxCode(ed.tax_code);
      setName(ed.name);
      setTaxMode(ed.tax_mode);
      setRatePercent(String(ed.rate_percent));
      setSortOrder(String(ed.sort_order));
      setStatus(ed.status);
    } else {
      setTaxCode("");
      setName("");
      setTaxMode("included");
      setRatePercent("12");
      setSortOrder("0");
      setStatus("active");
      void apiFetch<{ next_code: string }>("/api/v1/quotation/tax-types/next-code").then((res) => {
        if (res.success && res.data) setTaxCode(res.data.next_code);
      });
    }
  });

  const save = async () => {
    const form = { name: name(), tax_mode: taxMode(), rate_percent: ratePercent(), status: status() };
    const clientError = requireFields(form, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const body = {
      name: name(),
      tax_mode: taxMode(),
      rate_percent: Number(ratePercent()),
      formula_json: {},
      sort_order: Number(sortOrder()) || 0,
      status: status(),
    };
    setSaving(true);
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/quotation/tax-types/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/quotation/tax-types", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Tax type updated." : "Tax type created.",
    );
    setSaving(false);
    if (!ok) return;
    props.onSaved();
    props.onClose();
  };

  return (
    <EntityModal
      open={props.open}
      title={props.editing ? "Edit Tax Type" : "New Tax Type"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
    >
      <Field label="Tax code">
        <input class={inputClass} value={taxCode()} readOnly />
      </Field>
      <Field label="Name *">
        <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </Field>
      <Field label="Tax mode *">
        <select class={inputClass} value={taxMode()} onChange={(e) => setTaxMode(e.currentTarget.value)}>
          <option value="included">Included</option>
          <option value="excluded">Excluded</option>
          <option value="none">None</option>
        </select>
      </Field>
      <Field label="Rate %">
        <input type="number" class={inputClass} value={ratePercent()} onInput={(e) => setRatePercent(e.currentTarget.value)} />
        <p class="mt-1 text-xs text-text-secondary">
          Applied to quotation line tax, non-VAT, and total columns via Tax Management rates.
        </p>
      </Field>
      <Field label="Sort order">
        <input type="number" class={inputClass} value={sortOrder()} onInput={(e) => setSortOrder(e.currentTarget.value)} />
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

export default function TaxTypeListPage() {
  const invalidate = useInvalidateTaxTypes();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("sort_order");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<TaxTypeDetail | null>(null);

  const list = useTaxTypeList(() => ({
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
          { key: "tax_code", header: "Tax Code", clickable: true },
          { key: "name", header: "Name", clickable: true },
          { key: "tax_mode", header: "Tax Mode" },
          { key: "rate_percent", header: "Rate %", render: (r) => `${r.rate_percent}%` },
          { key: "sort_order", header: "Sort" },
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
        codeKey="tax_code"
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
        settingsHref={QUOTATION_SETTINGS_HREF.taxType}
      />
      <TaxTypeModal open={modalOpen()} editing={editing()} onClose={() => setModalOpen(false)} onSaved={invalidate} />
    </QuotationLayout>
  );
}
