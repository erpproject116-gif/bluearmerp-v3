import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";
import { CompanyBudgetLayout } from "./CompanyBudgetLayout";

type Budget = {
  id: number;
  fiscal_year: number;
  name: string;
  status: string;
};

export default function BudgetListPage() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [fiscalYear, setFiscalYear] = createSignal(String(new Date().getFullYear()));
  const [name, setName] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["company-budgets"],
    queryFn: async () => {
      const res = await apiFetch<Budget[]>("/api/v1/company-budget/budgets");
      if (!res.success) throw new Error(res.message ?? "Failed to load budgets");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["company-budgets"] });

  const openNew = () => {
    setFiscalYear(String(new Date().getFullYear()));
    setName("");
    setModalOpen(true);
  };

  const openDetail = (row: Budget) => {
    navigate(`/app/finance/budgets/${row.id}`);
  };

  const save = async () => {
    const year = Number(fiscalYear());
    if (!name().trim() || !year) {
      toast.warning("Fiscal year and name are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<Budget>("/api/v1/company-budget/budgets", {
      method: "POST",
      body: JSON.stringify({ fiscal_year: year, name: name().trim() }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create budget.");
      return;
    }
    toast.success("Budget created.");
    setModalOpen(false);
    invalidate();
    if (res.data?.id) navigate(`/app/finance/budgets/${res.data.id}`);
  };

  return (
    <CompanyBudgetLayout>
      <SpreadsheetGrid<Budget>
        columns={[
          { key: "name", header: "Name", clickable: true },
          { key: "fiscal_year", header: "Fiscal year" },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={openDetail}
        settingsHref="/app/finance/budgets"
        codeKey="name"
        nameKey="name"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title="New budget"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Fiscal year *">
          <input
            type="number"
            class={inputClass}
            value={fiscalYear()}
            onInput={(e) => setFiscalYear(e.currentTarget.value)}
          />
        </Field>
        <Field label="Name *">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </CompanyBudgetLayout>
  );
}
