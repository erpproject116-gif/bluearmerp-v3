import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { FinanceLayout } from "../FinanceLayout";

type DocumentSeries = {
  id: number;
  doc_type: string;
  prefix: string;
  start_no: number;
  end_no: number;
  next_no: number;
  permit_ref?: string | null;
  cas_ref?: string | null;
  is_active: boolean;
};

const DOC_TYPES = [
  { value: "official_receipt", label: "Official receipt" },
  { value: "sales_invoice", label: "Sales invoice" },
];

export default function DocumentSeriesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [docType, setDocType] = createSignal("official_receipt");
  const [prefix, setPrefix] = createSignal("");
  const [startNo, setStartNo] = createSignal("1");
  const [endNo, setEndNo] = createSignal("9999");
  const [nextNo, setNextNo] = createSignal("1");
  const [permitRef, setPermitRef] = createSignal("");
  const [casRef, setCasRef] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["document-series"],
    queryFn: async () => {
      const res = await apiFetch<DocumentSeries[]>("/api/v1/finance/statutory/document-series");
      if (!res.success) throw new Error(res.message ?? "Failed to load series");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["document-series"] });

  const resetForm = () => {
    setDocType("official_receipt");
    setPrefix("");
    setStartNo("1");
    setEndNo("9999");
    setNextNo("1");
    setPermitRef("");
    setCasRef("");
    setIsActive(true);
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (row: DocumentSeries) => {
    setEditingId(row.id);
    setDocType(row.doc_type);
    setPrefix(row.prefix);
    setStartNo(String(row.start_no));
    setEndNo(String(row.end_no));
    setNextNo(String(row.next_no));
    setPermitRef(row.permit_ref ?? "");
    setCasRef(row.cas_ref ?? "");
    setIsActive(row.is_active);
    setModalOpen(true);
  };

  const payload = () => ({
    doc_type: docType(),
    prefix: prefix().trim(),
    start_no: Number(startNo()) || 1,
    end_no: Number(endNo()) || 1,
    next_no: Number(nextNo()) || 1,
    permit_ref: permitRef().trim() || null,
    cas_ref: casRef().trim() || null,
    is_active: isActive(),
  });

  const save = async () => {
    if (!endNo().trim()) {
      toast.warning("End number is required.");
      return;
    }
    setSaving(true);
    const id = editingId();
    const res = await apiFetch<DocumentSeries>(
      id ? `/api/v1/finance/statutory/document-series/${id}` : "/api/v1/finance/statutory/document-series",
      { method: id ? "PATCH" : "POST", body: JSON.stringify(payload()) },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save series.");
      return;
    }
    toast.success(id ? "Document series updated." : "Document series created.");
    setModalOpen(false);
    invalidate();
  };

  const selectedRow = () => list.data?.rows.find((r) => r.id === selectedId()) ?? null;

  return (
    <FinanceLayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">BIR document series</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Configure permit/CAS-backed numbering. When an active series exists for official receipts, it is used instead of the daily YYMMDD sequence.
        </p>
      </section>
      <SpreadsheetGrid<DocumentSeries>
        columns={[
          { key: "doc_type", header: "Doc type", clickable: true },
          { key: "prefix", header: "Prefix" },
          { key: "start_no", header: "Start" },
          { key: "end_no", header: "End" },
          { key: "next_no", header: "Next #" },
          { key: "permit_ref", header: "Permit", render: (r) => r.permit_ref ?? "—" },
          { key: "cas_ref", header: "CAS", render: (r) => r.cas_ref ?? "—" },
          { key: "is_active", header: "Active", render: (r) => (r.is_active ? "Yes" : "No") },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {
          const row = selectedRow();
          if (row) openEdit(row);
        }}
        codeKey="doc_type"
        nameKey="prefix"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
        exportFilename="document-series"
        exportTitle="Document Series"
      />
      <EntityModal
        open={modalOpen()}
        title={editingId() ? "Edit document series" : "New document series"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Field label="Document type *">
          <select class={inputClass} value={docType()} onChange={(e) => setDocType(e.currentTarget.value)}>
            <For each={DOC_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
          </select>
        </Field>
        <Field label="Prefix">
          <input class={inputClass} value={prefix()} onInput={(e) => setPrefix(e.currentTarget.value)} placeholder="OR-" />
        </Field>
        <Field label="Start number">
          <input class={inputClass} type="number" min="1" value={startNo()} onInput={(e) => setStartNo(e.currentTarget.value)} />
        </Field>
        <Field label="End number *">
          <input class={inputClass} type="number" min="1" value={endNo()} onInput={(e) => setEndNo(e.currentTarget.value)} />
        </Field>
        <Field label="Next number">
          <input class={inputClass} type="number" min="1" value={nextNo()} onInput={(e) => setNextNo(e.currentTarget.value)} />
        </Field>
        <Field label="BIR permit reference">
          <input class={inputClass} value={permitRef()} onInput={(e) => setPermitRef(e.currentTarget.value)} />
        </Field>
        <Field label="CAS reference">
          <input class={inputClass} value={casRef()} onInput={(e) => setCasRef(e.currentTarget.value)} />
        </Field>
        <Field label="Active">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
            Active
          </label>
        </Field>
      </EntityModal>
    </FinanceLayout>
  );
}
