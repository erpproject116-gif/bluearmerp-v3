import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { AcctIILayout } from "./AcctIILayout";

type Check = {
  id: number;
  check_no: string;
  check_date: string;
  bank_account_id?: number | null;
  payee_name: string;
  amount: number;
  status: string;
};

type BankAccount = {
  id: number;
  bank_account_code: string;
  bank_account_name: string;
};

export default function CheckRegisterPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [checkNo, setCheckNo] = createSignal("");
  const [checkDate, setCheckDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = createSignal("");
  const [payeeName, setPayeeName] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["finance-checks"],
    queryFn: async () => {
      const res = await apiFetch<Check[]>("/api/v1/finance/checks");
      if (!res.success) throw new Error(res.message ?? "Failed to load checks");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const banks = createQuery(() => ({
    queryKey: ["bank-accounts-mini"],
    queryFn: async () => {
      const res = await apiFetch<BankAccount[]>(
        "/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc",
      );
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["finance-checks"] });

  const openNew = () => {
    setCheckNo("");
    setCheckDate(new Date().toISOString().slice(0, 10));
    setBankAccountId("");
    setPayeeName("");
    setAmount("");
    setModalOpen(true);
  };

  const save = async () => {
    if (!checkNo().trim() || !payeeName().trim()) {
      toast.warning("Check number and payee are required.");
      return;
    }
    setSaving(true);
    const bankId = bankAccountId() ? Number(bankAccountId()) : undefined;
    const res = await apiFetch<Check>("/api/v1/finance/checks", {
      method: "POST",
      body: JSON.stringify({
        check_no: checkNo().trim(),
        check_date: checkDate(),
        bank_account_id: bankId,
        payee_name: payeeName().trim(),
        amount: Number(amount()) || 0,
        status: "issued",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create check.");
      return;
    }
    toast.success("Check recorded.");
    setModalOpen(false);
    invalidate();
  };

  const markCleared = async (row: Check) => {
    const res = await apiFetch(`/api/v1/finance/checks/${row.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cleared" }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update check.");
      return;
    }
    toast.success("Check marked cleared.");
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Check register</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Acct. II — track issued checks, link to bank accounts, and mark cleared for reconciliation.
        </p>
      </section>
      <SpreadsheetGrid<Check>
        columns={[
          { key: "check_no", header: "Check #", clickable: true },
          { key: "check_date", header: "Date" },
          { key: "payee_name", header: "Payee" },
          {
            key: "amount",
            header: "Amount",
            render: (r) => r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
          {
            key: "id",
            header: "",
            sortable: false,
            render: (r) =>
              r.status === "issued" ? (
                <button type="button" class="text-sm font-medium text-brand-600 hover:underline" onClick={() => markCleared(r)}>
                  Mark cleared
                </button>
              ) : null,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="check_no"
        nameKey="payee_name"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />
      <EntityModal
        open={modalOpen()}
        title="New check"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Check number *">
          <input class={inputClass} value={checkNo()} onInput={(e) => setCheckNo(e.currentTarget.value)} />
        </Field>
        <Field label="Check date">
          <input class={inputClass} type="date" value={checkDate()} onInput={(e) => setCheckDate(e.currentTarget.value)} />
        </Field>
        <Field label="Bank account">
          <select class={inputClass} value={bankAccountId()} onChange={(e) => setBankAccountId(e.currentTarget.value)}>
            <option value="">— Optional —</option>
            {(banks.data ?? []).map((b) => (
              <option value={String(b.id)}>
                {b.bank_account_code} — {b.bank_account_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payee *">
          <input class={inputClass} value={payeeName()} onInput={(e) => setPayeeName(e.currentTarget.value)} />
        </Field>
        <Field label="Amount">
          <input class={inputClass} type="number" min="0" step="0.01" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
