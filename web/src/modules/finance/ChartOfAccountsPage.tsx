import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For } from "solid-js";
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
  sort_order: number;
  child_count: number;
};

const accountTypeOptions: Array<AccountRow["account_type"]> = ["asset", "liability", "equity", "income", "expense"];

export default function ChartOfAccountsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, statusFilter, setStatusFilter } = useListState("sort_order");
  const [typeFilter, setTypeFilter] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
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
      const res = await apiFetch<AccountRow[]>("/api/v1/finance/accounts?page=1&pageSize=500&sort=account_code&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed to load account options");
      return res.data ?? [];
    },
  }));

  const currentRows = createMemo(() => list.data?.rows ?? []);

  const invalidate = () => void client.invalidateQueries({ queryKey: ["finance-accounts"] });

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

  const remove = async () => {
    const id = selectedId();
    if (!id) {
      toast.warning("Select an account to delete.");
      return;
    }
    const row = currentRows().find((r) => r.id === id);
    if (!row) {
      toast.warning("Select an account to delete.");
      return;
    }
    if (!window.confirm(`Delete account ${row.account_code} - ${row.account_name}?`)) return;
    const res = await apiFetch(`/api/v1/finance/accounts/${id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to delete account.");
      return;
    }
    setSelectedId(null);
    invalidate();
  };

  return (
    <FinanceLayout>
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
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => void remove()}
        >
          Delete selected
        </button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "account_code", header: "Code" },
          { key: "account_name", header: "Name" },
          { key: "account_type", header: "Type" },
          { key: "parent_code", header: "Parent", render: (r) => (r.parent_code ? `${r.parent_code} - ${r.parent_name ?? ""}` : "—") },
          { key: "is_group", header: "Group", render: (r) => (r.is_group ? "Yes" : "No"), sortable: false },
          { key: "is_active", header: "Active", render: (r) => (r.is_active ? "Yes" : "No") },
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
        status={statusFilter()}
        onStatusChange={setStatusFilter}
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
            <For each={accountTypeOptions}>{(t) => <option value={t}>{t}</option>}</For>
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
