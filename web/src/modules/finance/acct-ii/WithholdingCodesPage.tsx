import { createSignal } from "solid-js";
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
};

export default function WithholdingCodesPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [code, setCode] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [ratePct, setRatePct] = createSignal("2");
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

  const openNew = () => {
    setCode("");
    setDescription("");
    setRatePct("2");
    setModalOpen(true);
  };

  const save = async () => {
    if (!code().trim() || !description().trim()) {
      toast.warning("Code and description are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<WithholdingCode>("/api/v1/finance/withholding-codes", {
      method: "POST",
      body: JSON.stringify({
        code: code().trim(),
        description: description().trim(),
        rate_pct: Number(ratePct()) || 0,
        active: true,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create code.");
      return;
    }
    toast.success("Withholding code created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Withholding tax codes</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Acct. II — define BIR-style withholding rates (e.g. 2307) applied on payment vouchers and supplier invoices.
        </p>
      </section>
      <SpreadsheetGrid<WithholdingCode>
        columns={[
          { key: "code", header: "Code", clickable: true },
          { key: "description", header: "Description" },
          {
            key: "rate_pct",
            header: "Rate %",
            render: (r) => `${r.rate_pct}%`,
          },
          {
            key: "active",
            header: "Active",
            render: (r) => (r.active ? "Yes" : "No"),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="code"
        nameKey="description"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />
      <EntityModal
        open={modalOpen()}
        title="New withholding code"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Code *">
          <input class={inputClass} value={code()} onInput={(e) => setCode(e.currentTarget.value)} placeholder="WHT002" />
        </Field>
        <Field label="Description *">
          <input
            class={inputClass}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Creditable withholding 2%"
          />
        </Field>
        <Field label="Rate %">
          <input
            class={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={ratePct()}
            onInput={(e) => setRatePct(e.currentTarget.value)}
          />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
