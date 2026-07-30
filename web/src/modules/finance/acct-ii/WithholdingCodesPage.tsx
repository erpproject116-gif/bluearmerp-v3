import { createSignal, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { AcctIILayout } from "./AcctIILayout";

type WithholdingCode = {
  id: number;
  code: string;
  description: string;
  rate_pct: number;
  active: boolean;
  atc_code?: string | null;
  tax_type?: string | null;
  income_payment_type?: string | null;
  rr_reference?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export default function WithholdingCodesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [code, setCode] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [ratePct, setRatePct] = createSignal("2");
  const [atcCode, setAtcCode] = createSignal("");
  const [taxType, setTaxType] = createSignal("EWT");
  const [incomePaymentType, setIncomePaymentType] = createSignal("");
  const [rrReference, setRrReference] = createSignal("");
  const [effectiveFrom, setEffectiveFrom] = createSignal("");
  const [effectiveTo, setEffectiveTo] = createSignal("");
  const [active, setActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["withholding-codes"],
    queryFn: async () => {
      const res = await apiFetch<WithholdingCode[]>("/api/v1/finance/withholding-codes");
      if (!res.success) throw new Error(res.message ?? "Failed to load withholding codes");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["withholding-codes"] });

  const resetForm = () => {
    setCode("");
    setDescription("");
    setRatePct("2");
    setAtcCode("");
    setTaxType("EWT");
    setIncomePaymentType("");
    setRrReference("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setActive(true);
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (row: WithholdingCode) => {
    setEditingId(row.id);
    setCode(row.code);
    setDescription(row.description);
    setRatePct(String(row.rate_pct));
    setAtcCode(row.atc_code ?? "");
    setTaxType(row.tax_type ?? "EWT");
    setIncomePaymentType(row.income_payment_type ?? "");
    setRrReference(row.rr_reference ?? "");
    setEffectiveFrom(row.effective_from ?? "");
    setEffectiveTo(row.effective_to ?? "");
    setActive(row.active);
    setModalOpen(true);
  };

  const payload = () => ({
    code: code().trim(),
    description: description().trim(),
    rate_pct: Number(ratePct()) || 0,
    active: active(),
    atc_code: atcCode().trim() || null,
    tax_type: taxType().trim() || null,
    income_payment_type: incomePaymentType().trim() || null,
    rr_reference: rrReference().trim() || null,
    effective_from: effectiveFrom().trim() || null,
    effective_to: effectiveTo().trim() || null,
  });

  const save = async () => {
    if (!code().trim() || !description().trim()) {
      toast.warning("Code and description are required.");
      return;
    }
    setSaving(true);
    const id = editingId();
    const res = await apiFetch<WithholdingCode>(
      id ? `/api/v1/finance/withholding-codes/${id}` : "/api/v1/finance/withholding-codes",
      { method: id ? "PATCH" : "POST", body: JSON.stringify(payload()) },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save code.");
      return;
    }
    toast.success(id ? "Withholding code updated." : "Withholding code created.");
    setModalOpen(false);
    invalidate();
  };

  const deactivate = async () => {
    const id = editingId();
    if (!id) return;
    if (!confirm("Deactivate this withholding code?")) return;
    setSaving(true);
    const res = await apiFetch(`/api/v1/finance/withholding-codes/${id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to deactivate.");
      return;
    }
    toast.success("Withholding code deactivated.");
    setModalOpen(false);
    invalidate();
  };

  const selectedRow = () => list.data?.rows.find((r) => r.id === selectedId()) ?? null;

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Withholding tax codes (ATC master)</h2>
        <p class="mt-1 text-sm text-text-secondary">
          BIR alphalist ATC codes for expanded withholding (2307), FWT, and compensation. Used on payment vouchers and supplier invoices (withholding recognized at purchase GL post). Verify rates with your CPA before filing.
        </p>
      </section>
      <SpreadsheetGrid<WithholdingCode>
        columns={[
          { key: "code", header: "Code", clickable: true },
          { key: "atc_code", header: "ATC", render: (r) => r.atc_code ?? "—" },
          { key: "tax_type", header: "Type", render: (r) => r.tax_type ?? "—" },
          { key: "description", header: "Description" },
          { key: "income_payment_type", header: "Payment type", render: (r) => r.income_payment_type ?? "—" },
          { key: "rate_pct", header: "Rate %", render: (r) => `${r.rate_pct}%` },
          { key: "rr_reference", header: "RR ref", render: (r) => r.rr_reference ?? "—" },
          { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
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
        codeKey="code"
        nameKey="description"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
        exportFilename="withholding-codes"
        exportTitle="Withholding Tax Codes"
      />
      <EntityModal
        open={modalOpen()}
        title={editingId() ? "Edit withholding code" : "New withholding code"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Field label="Code *">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="WI010" />
        </Field>
        <Field label="ATC code">
          <input class={inputClass} value={atcCode()} onInput={(e) => setAtcCode(e.currentTarget.value)} placeholder="WI010" />
        </Field>
        <Field label="Tax type">
          <select class={inputClass} value={taxType()} onChange={(e) => setTaxType(e.currentTarget.value)}>
            <option value="EWT">EWT</option>
            <option value="FWT">FWT</option>
            <option value="compensation">Compensation</option>
          </select>
        </Field>
        <Field label="Description *">
          <input class={inputClass} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </Field>
        <Field label="Income payment type">
          <input
            class={inputClass}
            value={incomePaymentType()}
            onInput={(e) => setIncomePaymentType(e.currentTarget.value)}
            placeholder="professional, rent, goods…"
          />
        </Field>
        <Field label="Rate %">
          <input class={inputClass} type="number" min="0" step="0.01" value={ratePct()} onInput={(e) => setRatePct(e.currentTarget.value)} />
        </Field>
        <Field label="RR reference">
          <input class={inputClass} value={rrReference()} onInput={(e) => setRrReference(e.currentTarget.value)} placeholder="RR-2-1998" />
        </Field>
        <Field label="Effective from">
          <input class={inputClass} type="date" value={effectiveFrom()} onInput={(e) => setEffectiveFrom(e.currentTarget.value)} />
        </Field>
        <Field label="Effective to">
          <input class={inputClass} type="date" value={effectiveTo()} onInput={(e) => setEffectiveTo(e.currentTarget.value)} />
        </Field>
        <Field label="Active">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active()} onChange={(e) => setActive(e.currentTarget.checked)} />
            Active
          </label>
        </Field>
        <Show when={editingId()}>
          <div class="mt-2 border-t border-stroke pt-3">
            <button type="button" class="text-sm text-red-600 hover:underline" onClick={() => void deactivate()}>
              Deactivate code
            </button>
          </div>
        </Show>
      </EntityModal>
    </AcctIILayout>
  );
}
