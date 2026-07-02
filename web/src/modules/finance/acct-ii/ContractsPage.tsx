import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { AcctIILayout } from "./AcctIILayout";

type Contract = {
  id: number;
  contract_no: string;
  partner_id: number;
  title: string;
  start_date: string;
  end_date?: string | null;
  total_amount: number;
  status: string;
};

type Partner = {
  id: number;
  partner_code: string;
  company_name: string;
};

export default function ContractsPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [contractNo, setContractNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [startDate, setStartDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = createSignal("");
  const [totalAmount, setTotalAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["finance-contracts"],
    queryFn: async () => {
      const res = await apiFetch<Contract[]>("/api/v1/finance/contracts");
      if (!res.success) throw new Error(res.message ?? "Failed to load contracts");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const partners = createQuery(() => ({
    queryKey: ["partners-mini-contracts"],
    queryFn: async () => {
      const res = await apiFetch<Partner[]>("/api/v1/inventory/partners?page=1&pageSize=200&sort=company_name&order=asc");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const partnerName = (id: number) => {
    const p = (partners.data ?? []).find((x) => x.id === id);
    return p ? `${p.partner_code} — ${p.company_name}` : `#${id}`;
  };

  const invalidate = () => void client.invalidateQueries({ queryKey: ["finance-contracts"] });

  const openNew = () => {
    setContractNo("");
    setPartnerId("");
    setTitle("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setTotalAmount("");
    setModalOpen(true);
  };

  const save = async () => {
    const pid = Number(partnerId());
    if (!contractNo().trim() || !title().trim() || !pid) {
      toast.warning("Contract number, title, and partner are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<Contract>("/api/v1/finance/contracts", {
      method: "POST",
      body: JSON.stringify({
        contract_no: contractNo().trim(),
        partner_id: pid,
        title: title().trim(),
        start_date: startDate(),
        end_date: endDate().trim() || null,
        total_amount: Number(totalAmount()) || 0,
        status: "active",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create contract.");
      return;
    }
    toast.success("Contract created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Contracts & milestone billing</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Acct. II — track customer or vendor contracts for progress billing and revenue recognition.
        </p>
      </section>
      <SpreadsheetGrid<Contract>
        columns={[
          { key: "contract_no", header: "Contract #", clickable: true },
          { key: "title", header: "Title" },
          {
            key: "partner_id",
            header: "Partner",
            render: (r) => partnerName(r.partner_id),
          },
          { key: "start_date", header: "Start" },
          { key: "end_date", header: "End" },
          {
            key: "total_amount",
            header: "Total",
            render: (r) => r.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="contract_no"
        nameKey="title"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />
      <EntityModal
        open={modalOpen()}
        title="New contract"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Contract number *">
          <input class={inputClass} value={contractNo()} onInput={(e) => setContractNo(e.currentTarget.value)} />
        </Field>
        <Field label="Title *">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Partner *">
          <select class={inputClass} value={partnerId()} onChange={(e) => setPartnerId(e.currentTarget.value)}>
            <option value="">Select partner…</option>
            {(partners.data ?? []).map((p) => (
              <option value={String(p.id)}>
                {p.partner_code} — {p.company_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input class={inputClass} type="date" value={startDate()} onInput={(e) => setStartDate(e.currentTarget.value)} />
        </Field>
        <Field label="End date">
          <input class={inputClass} type="date" value={endDate()} onInput={(e) => setEndDate(e.currentTarget.value)} />
        </Field>
        <Field label="Total contract value">
          <input class={inputClass} type="number" min="0" step="0.01" value={totalAmount()} onInput={(e) => setTotalAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
