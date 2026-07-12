import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { FinanceLayout } from "./FinanceLayout";

type AccountRow = {
  id: number;
  account_code: string;
  account_name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  parent_id?: number | null;
  parent_code?: string;
  parent_name?: string;
  is_group: boolean;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  child_count: number;
};

type FinanceDefaults = {
  cash_account_id?: number | null;
  receivable_account_id?: number | null;
  payable_account_id?: number | null;
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  input_vat_account_id?: number | null;
  output_vat_account_id?: number | null;
};

type DefaultSlot = {
  key: keyof FinanceDefaults;
  label: string;
  hint: string;
  types: Array<AccountRow["account_type"]>;
};

const accountTypeOptions: Array<AccountRow["account_type"]> = ["asset", "liability", "equity", "income", "expense"];

const PH_BANDS: Record<AccountRow["account_type"], string> = {
  asset: "1000–1999",
  liability: "2000–2999",
  equity: "3000–3999",
  income: "4000–4999",
  expense: "5000–5999",
};

const DEFAULT_SLOTS: DefaultSlot[] = [
  { key: "cash_account_id", label: "Cash / bank receipts", hint: "Official receipts, POS cash", types: ["asset"] },
  { key: "receivable_account_id", label: "Accounts receivable", hint: "Sales on credit, POS A/R", types: ["asset"] },
  { key: "payable_account_id", label: "Accounts payable", hint: "Supplier invoices on credit", types: ["liability"] },
  { key: "sales_account_id", label: "Sales revenue", hint: "Sales invoices and POS", types: ["income"] },
  { key: "purchase_account_id", label: "Purchases / COGS", hint: "Supplier invoices, inventory cost", types: ["expense"] },
  { key: "input_vat_account_id", label: "Input VAT", hint: "VAT paid to vendors (BIR)", types: ["asset"] },
  { key: "output_vat_account_id", label: "Output VAT", hint: "VAT collected on sales (BIR)", types: ["liability"] },
];

const emptyDefaults = (): FinanceDefaults => ({
  cash_account_id: null,
  receivable_account_id: null,
  payable_account_id: null,
  sales_account_id: null,
  purchase_account_id: null,
  input_vat_account_id: null,
  output_vat_account_id: null,
});

export default function ChartOfAccountsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, statusFilter, setStatusFilter } = useListState(
    "sort_order",
    25,
    { defaultStatus: "" },
  );
  const [typeFilter, setTypeFilter] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [defaultsOpen, setDefaultsOpen] = createSignal(true);
  const [defaultsForm, setDefaultsForm] = createSignal<FinanceDefaults>(emptyDefaults());
  const [savingDefaults, setSavingDefaults] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [form, setForm] = createSignal({
    account_code: "",
    account_name: "",
    account_type: "asset" as AccountRow["account_type"],
    parent_id: "",
    is_group: false,
    is_active: true,
    sort_order: "0",
  });

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize),
      sort: sort(),
      order: order(),
      q: q(),
      status: statusFilter(),
      account_type: typeFilter(),
    });
    return {
      queryKey: ["finance-accounts", page(), sort(), order(), q(), statusFilter(), typeFilter()],
      queryFn: async () => {
        const res = await apiFetch<AccountRow[]>(`/api/v1/finance/accounts?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load accounts");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const parentOptions = createQuery(() => ({
    queryKey: ["finance-accounts-parent-options"],
    queryFn: async () => {
      const res = await apiFetch<AccountRow[]>("/api/v1/finance/accounts?page=1&pageSize=500&status=active&sort=account_code&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed to load account options");
      return res.data ?? [];
    },
  }));

  const defaultsQuery = createQuery(() => ({
    queryKey: ["finance-account-defaults"],
    queryFn: async () => {
      const res = await apiFetch<FinanceDefaults>("/api/v1/finance/accounts/defaults");
      if (!res.success) throw new Error(res.message ?? "Failed to load default accounts");
      return res.data ?? emptyDefaults();
    },
  }));

  createEffect(() => {
    const d = defaultsQuery.data;
    if (!d) return;
    setDefaultsForm({
      cash_account_id: d.cash_account_id ?? null,
      receivable_account_id: d.receivable_account_id ?? null,
      payable_account_id: d.payable_account_id ?? null,
      sales_account_id: d.sales_account_id ?? null,
      purchase_account_id: d.purchase_account_id ?? null,
      input_vat_account_id: d.input_vat_account_id ?? null,
      output_vat_account_id: d.output_vat_account_id ?? null,
    });
  });

  const activeAccounts = createMemo(() => parentOptions.data ?? []);

  const accountsForSlot = (types: Array<AccountRow["account_type"]>) =>
    activeAccounts().filter((a) => types.includes(a.account_type));

  const defaultsMappedCount = createMemo(() => {
    const d = defaultsForm();
    return DEFAULT_SLOTS.filter((s) => {
      const v = d[s.key];
      return v != null && v > 0;
    }).length;
  });

  const currentRows = createMemo(() => list.data?.rows ?? []);
  const isEmpty = createMemo(() => !list.isFetching && (list.data?.total ?? 0) === 0 && !q() && !typeFilter());
  const selectedRow = createMemo(() => currentRows().find((r) => r.id === selectedId()) ?? null);

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["finance-accounts"] });
    void client.invalidateQueries({ queryKey: ["finance-accounts-parent-options"] });
    void client.invalidateQueries({ queryKey: ["finance-account-defaults"] });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      account_code: "",
      account_name: "",
      account_type: "asset",
      parent_id: "",
      is_group: false,
      is_active: true,
      sort_order: "0",
    });
    setModalOpen(true);
  };

  const openEdit = (row: AccountRow) => {
    setEditingId(row.id);
    setForm({
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      parent_id: row.parent_id ? String(row.parent_id) : "",
      is_group: row.is_group,
      is_active: row.is_active,
      sort_order: String(row.sort_order),
    });
    setModalOpen(true);
  };

  const save = async () => {
    const editId = editingId();
    const body = {
      account_code: form().account_code.trim(),
      account_name: form().account_name.trim(),
      account_type: form().account_type,
      parent_id: form().parent_id ? Number(form().parent_id) : null,
      is_group: form().is_group,
      is_active: form().is_active,
      sort_order: Number(form().sort_order) || 0,
    };
    setSaving(true);
    const res = await apiFetch<AccountRow>(
      editId ? `/api/v1/finance/accounts/${editId}` : "/api/v1/finance/accounts",
      { method: editId ? "PATCH" : "POST", body: JSON.stringify(body) },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save account.");
      return;
    }
    setModalOpen(false);
    invalidate();
  };

  const deactivate = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select an account to deactivate.");
      return;
    }
    if (!window.confirm(`Deactivate ${row.account_code} - ${row.account_name}?`)) return;
    const res = await apiFetch<AccountRow>(`/api/v1/finance/accounts/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to deactivate account.");
      return;
    }
    setSelectedId(null);
    invalidate();
  };

  const remove = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select an account to remove.");
      return;
    }
    if (row.is_system) {
      toast.warning("System accounts cannot be removed. Deactivate instead.");
      return;
    }
    if (!window.confirm(`Remove ${row.account_code} - ${row.account_name}? This soft-deletes the account.`)) return;
    const res = await apiFetch(`/api/v1/finance/accounts/${row.id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to remove account.");
      return;
    }
    setSelectedId(null);
    invalidate();
  };

  const restore = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select a deleted account to restore.");
      return;
    }
    const res = await apiFetch<AccountRow>(`/api/v1/finance/accounts/${row.id}/restore`, { method: "POST" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to restore account.");
      return;
    }
    setSelectedId(null);
    setStatusFilter("");
    invalidate();
  };

  const importTemplate = async () => {
    if (!window.confirm("Import the Philippine SME starter chart (~35 accounts, codes 1000–5999)?")) return;
    setImporting(true);
    const res = await apiFetch<{ imported: number }>("/api/v1/finance/accounts/import-template", {
      method: "POST",
      body: JSON.stringify({ template: "ph_sme" }),
    });
    setImporting(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to import template.");
      return;
    }
    toast.success(`Imported ${res.data?.imported ?? 0} accounts.`);
    invalidate();
  };

  const saveDefaults = async () => {
    setSavingDefaults(true);
    const res = await apiFetch<FinanceDefaults>("/api/v1/finance/accounts/defaults", {
      method: "PATCH",
      body: JSON.stringify(defaultsForm()),
    });
    setSavingDefaults(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save default accounts.");
      return;
    }
    toast.success("Default account mappings saved.");
    void client.invalidateQueries({ queryKey: ["finance-account-defaults"] });
  };

  const setDefaultSlot = (key: keyof FinanceDefaults, value: string) => {
    const id = value ? Number(value) : null;
    setDefaultsForm((d) => ({ ...d, [key]: id }));
  };

  return (
    <FinanceLayout>
      <Show when={isEmpty()}>
        <div class="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-slate-700">
          <p class="font-medium text-brand-800">Start with an empty chart of accounts</p>
          <p class="mt-1">
            Philippine SME code bands: Assets 1000–1999, Liabilities 2000–2999, Equity 3000–3999, Revenue 4000–4999,
            Expenses 5000–5999.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={openCreate}
            >
              Add first account
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={importing()}
              onClick={() => void importTemplate()}
            >
              {importing() ? "Importing…" : "Import Philippine SME template"}
            </button>
          </div>
        </div>
      </Show>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-600">
          Type
          <select
            class={`${inputClass} ml-2 w-44`}
            value={typeFilter()}
            onChange={(e) => {
              setTypeFilter(e.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <For each={accountTypeOptions}>{(t) => <option value={t}>{t}</option>}</For>
          </select>
        </label>
        <label class="text-sm text-slate-600">
          Status
          <select
            class={`${inputClass} ml-2 w-36`}
            value={statusFilter()}
            onChange={(e) => {
              setStatusFilter(e.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="">All active</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => void deactivate()}
        >
          Deactivate selected
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => void remove()}
        >
          Remove selected
        </button>
        <Show when={statusFilter() === "deleted"}>
          <button
            type="button"
            class="rounded-lg border border-brand-300 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50"
            onClick={() => void restore()}
          >
            Restore selected
          </button>
        </Show>
        <Show when={!isEmpty()}>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={importing()}
            onClick={() => void importTemplate()}
          >
            Import PH template
          </button>
        </Show>
      </div>

      <Show when={!isEmpty()}>
        <div class="mb-4 rounded-xl border border-stroke bg-white shadow-sm">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setDefaultsOpen((v) => !v)}
          >
            <div>
              <p class="text-sm font-medium text-slate-800">Default account mappings</p>
              <p class="text-xs text-slate-500">
                Used by sales, purchases, receipts, and POS auto-posting. {defaultsMappedCount()} of {DEFAULT_SLOTS.length} mapped.
              </p>
            </div>
            <span class="text-sm text-slate-400">{defaultsOpen() ? "▾" : "▸"}</span>
          </button>
          <Show when={defaultsOpen()}>
            <div class="border-t border-stroke px-4 py-4">
              <p class="mb-3 text-xs text-slate-500">
                Map each role to an active account. Importing the Philippine SME template fills these automatically; adjust if needed.
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <For each={DEFAULT_SLOTS}>
                  {(slot) => (
                    <label class="block text-sm">
                      <span class="font-medium text-slate-700">{slot.label}</span>
                      <span class="block text-xs text-slate-500">{slot.hint}</span>
                      <select
                        class={`${inputClass} mt-1`}
                        value={defaultsForm()[slot.key] ? String(defaultsForm()[slot.key]) : ""}
                        onChange={(e) => setDefaultSlot(slot.key, e.currentTarget.value)}
                      >
                        <option value="">— Not set —</option>
                        <For each={accountsForSlot(slot.types)}>
                          {(acc) => (
                            <option value={acc.id}>
                              {acc.account_code} - {acc.account_name}
                            </option>
                          )}
                        </For>
                      </select>
                    </label>
                  )}
                </For>
              </div>
              <button
                type="button"
                class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={savingDefaults()}
                onClick={() => void saveDefaults()}
              >
                {savingDefaults() ? "Saving…" : "Save mappings"}
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <SpreadsheetGrid
        columns={[
          { key: "account_code", header: "Code" },
          { key: "account_name", header: "Name" },
          { key: "account_type", header: "Type" },
          { key: "parent_code", header: "Parent", render: (r) => (r.parent_code ? `${r.parent_code} - ${r.parent_name ?? ""}` : "—") },
          { key: "is_group", header: "Group", render: (r) => (r.is_group ? "Yes" : "No"), sortable: false },
          { key: "is_active", header: "Active", render: (r) => (r.is_active ? "Yes" : "No") },
          { key: "is_system", header: "System", render: (r) => (r.is_system ? "Yes" : "No"), sortable: false },
          { key: "sort_order", header: "Sort" },
        ]}
        rows={currentRows()}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openCreate}
        codeKey="account_code"
        nameKey="account_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title={editingId() ? "Edit account" : "New account"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <Field label="Account code">
          <input
            class={inputClass}
            value={form().account_code}
            onInput={(e) => setForm((v) => ({ ...v, account_code: e.currentTarget.value }))}
          />
          <p class="mt-1 text-xs text-slate-500">Philippine band for {form().account_type}: {PH_BANDS[form().account_type]}</p>
        </Field>
        <Field label="Account name">
          <input
            class={inputClass}
            value={form().account_name}
            onInput={(e) => setForm((v) => ({ ...v, account_name: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Account type">
          <select
            class={inputClass}
            value={form().account_type}
            onChange={(e) => setForm((v) => ({ ...v, account_type: e.currentTarget.value as AccountRow["account_type"] }))}
          >
            <For each={accountTypeOptions}>{(t) => <option value={t}>{t} ({PH_BANDS[t]})</option>}</For>
          </select>
        </Field>
        <Field label="Parent account">
          <select
            class={inputClass}
            value={form().parent_id}
            onChange={(e) => setForm((v) => ({ ...v, parent_id: e.currentTarget.value }))}
          >
            <option value="">None</option>
            <For each={parentOptions.data ?? []}>
              {(acc) => (
                <option value={acc.id} disabled={acc.id === editingId()}>
                  {acc.account_code} - {acc.account_name}
                </option>
              )}
            </For>
          </select>
        </Field>
        <Field label="Sort order">
          <input
            class={inputClass}
            type="number"
            value={form().sort_order}
            onInput={(e) => setForm((v) => ({ ...v, sort_order: e.currentTarget.value }))}
          />
        </Field>
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form().is_group}
              onChange={(e) => setForm((v) => ({ ...v, is_group: e.currentTarget.checked }))}
            />
            Group account
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form().is_active}
              onChange={(e) => setForm((v) => ({ ...v, is_active: e.currentTarget.checked }))}
            />
            Active
          </label>
        </div>
      </EntityModal>
    </FinanceLayout>
  );
}
