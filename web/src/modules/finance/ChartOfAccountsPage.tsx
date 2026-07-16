import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, ModalMessage, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
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
  disabled_account_types?: string[];
};

type DefaultAccountSlotKey = Exclude<keyof FinanceDefaults, "disabled_account_types">;

type DefaultSlot = {
  key: DefaultAccountSlotKey;
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
  disabled_account_types: [],
});

const CORE_ACCOUNT_TYPES: Array<AccountRow["account_type"]> = ["asset", "liability", "income", "expense"];
const OPTIONAL_ACCOUNT_TYPES: Array<AccountRow["account_type"]> = ["equity"];

export default function ChartOfAccountsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
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
  const [mappingsDirty, setMappingsDirty] = createSignal(false);
  const [savingDefaults, setSavingDefaults] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [pendingMapSlot, setPendingMapSlot] = createSignal<DefaultAccountSlotKey | null>(null);
  const [mapLabels, setMapLabels] = createSignal<Partial<Record<DefaultAccountSlotKey, string>>>({});
  const [form, setForm] = createSignal({
    account_code: "",
    account_name: "",
    account_type: "asset" as AccountRow["account_type"],
    parent_id: "",
    is_group: false,
    is_active: true,
    sort_order: "0",
  });

  const accountLabel = (acc: { account_code: string; account_name: string }) =>
    `${acc.account_code} - ${acc.account_name}`;

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
      placeholderData: (prev: { rows: AccountRow[]; total: number } | undefined) => prev,
    };
  });

  const parentOptions = createQuery(() => ({
    queryKey: ["finance-accounts-parent-options"],
    queryFn: async () => {
      // Fetch per account_type so expense (5xxx) is never truncated by a global pageSize
      // cap when the chart has many asset/liability rows ahead of it.
      const types: AccountRow["account_type"][] = ["asset", "liability", "equity", "income", "expense"];
      const chunks = await Promise.all(
        types.map(async (accountType) => {
          const res = await apiFetch<AccountRow[]>(
            `/api/v1/finance/accounts?page=1&pageSize=2000&status=active&account_type=${accountType}&sort=account_code&order=asc`,
          );
          if (!res.success) throw new Error(res.message ?? "Failed to load account options");
          return res.data ?? [];
        }),
      );
      return chunks.flat();
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
    if (!d || mappingsDirty()) return;
    setDefaultsForm({
      cash_account_id: d.cash_account_id ?? null,
      receivable_account_id: d.receivable_account_id ?? null,
      payable_account_id: d.payable_account_id ?? null,
      sales_account_id: d.sales_account_id ?? null,
      purchase_account_id: d.purchase_account_id ?? null,
      input_vat_account_id: d.input_vat_account_id ?? null,
      output_vat_account_id: d.output_vat_account_id ?? null,
      disabled_account_types: d.disabled_account_types ?? [],
    });
  });

  const activeAccounts = createMemo(() => parentOptions.data ?? []);

  const disabledTypes = createMemo(() => new Set((defaultsForm().disabled_account_types ?? []).map((t) => t.toLowerCase())));
  const enabledAccountTypes = createMemo(() => accountTypeOptions.filter((t) => !disabledTypes().has(t)));
  const isTypeEnabled = (t: AccountRow["account_type"]) => !disabledTypes().has(t);

  /** Posting accounts only (exclude group headers and disabled types). */
  const accountsForSlot = (types: Array<AccountRow["account_type"]>) =>
    activeAccounts().filter(
      (a) => !a.is_group && types.includes(a.account_type) && isTypeEnabled(a.account_type),
    );

  createEffect(() => {
    const d = defaultsForm();
    const accounts = activeAccounts();
    setMapLabels((prev) => {
      const next = { ...prev };
      for (const slot of DEFAULT_SLOTS) {
        const id = d[slot.key];
        if (id == null || id <= 0) {
          // Keep whatever the user is typing; only Clear should blank the label.
          if (!(slot.key in next)) next[slot.key] = "";
          continue;
        }
        const acc = accounts.find((a) => a.id === id);
        if (acc) next[slot.key] = accountLabel(acc);
      }
      return next;
    });
  });

  const fetchAccountsForSlot = async (
    types: Array<AccountRow["account_type"]>,
    q: string,
  ): Promise<LookupOption[]> => {
    const needle = q.trim().toLowerCase();
    return accountsForSlot(types)
      .filter((a) => {
        if (!needle) return true;
        return (
          a.account_code.toLowerCase().includes(needle) ||
          a.account_name.toLowerCase().includes(needle)
        );
      })
      .slice(0, 40)
      .map((a) => ({
        id: a.id,
        label: accountLabel(a),
        sublabel: a.account_type,
      }));
  };

  const purchaseCogsOptions = createMemo(() => accountsForSlot(["expense"]));
  const purchaseCogsEmpty = createMemo(() => purchaseCogsOptions().length === 0);
  const purchaseNeedsEnsure = createMemo(() => {
    if (purchaseCogsEmpty()) return true;
    const id = defaultsForm().purchase_account_id;
    if (!id) return true;
    return !purchaseCogsOptions().some((a) => a.id === id);
  });
  const [ensuringPurchaseCogs, setEnsuringPurchaseCogs] = createSignal(false);

  const defaultsMappedCount = createMemo(() => {
    const d = defaultsForm();
    return DEFAULT_SLOTS.filter((s) => {
      const v = d[s.key];
      return v != null && v > 0;
    }).length;
  });

  const ensurePurchaseCogs = async () => {
    setEnsuringPurchaseCogs(true);
    const res = await apiFetch<{
      account: AccountRow;
      created: boolean;
      mapped: boolean;
      defaults: FinanceDefaults;
    }>("/api/v1/finance/accounts/ensure-purchase-cogs", { method: "POST" }, { silent: true });
    setEnsuringPurchaseCogs(false);
    if (!res.success) {
      const detail = res.errors ? Object.values(res.errors).filter(Boolean).join(" · ") : "";
      toast.warning(detail || res.message || "Could not create Purchases / COGS account.");
      return;
    }

    const acct = res.data?.account;
    const mergeAccount = (rows: AccountRow[] | undefined) => {
      const list = rows ?? [];
      if (!acct?.id) return list;
      if (list.some((a) => a.id === acct.id)) {
        return list.map((a) => (a.id === acct.id ? { ...a, ...acct } : a));
      }
      return [...list, acct].sort((a, b) => a.account_code.localeCompare(b.account_code));
    };

    // Apply mapping in the form first so the combo shows the new expense account.
    if (res.data?.defaults) {
      setDefaultsForm({
        cash_account_id: res.data.defaults.cash_account_id ?? null,
        receivable_account_id: res.data.defaults.receivable_account_id ?? null,
        payable_account_id: res.data.defaults.payable_account_id ?? null,
        sales_account_id: res.data.defaults.sales_account_id ?? null,
        purchase_account_id: res.data.defaults.purchase_account_id ?? acct?.id ?? null,
        input_vat_account_id: res.data.defaults.input_vat_account_id ?? null,
        output_vat_account_id: res.data.defaults.output_vat_account_id ?? null,
      });
    } else if (acct?.id) {
      setDefaultsForm((v) => ({ ...v, purchase_account_id: acct.id }));
    }
    if (acct) {
      setMapLabels((m) => ({ ...m, purchase_account_id: accountLabel(acct) }));
    }

    client.setQueryData<AccountRow[]>(["finance-accounts-parent-options"], mergeAccount);
    await client.invalidateQueries({ queryKey: ["finance-accounts"] });
    // Refetch mapping options, then re-merge so a truncated refetch cannot drop 5010.
    await client.refetchQueries({ queryKey: ["finance-accounts-parent-options"] });
    client.setQueryData<AccountRow[]>(["finance-accounts-parent-options"], mergeAccount);
    await client.invalidateQueries({ queryKey: ["finance-account-defaults"] });

    setMappingsDirty(false);
    toast.success(
      res.data?.created
        ? `Created ${acct?.account_code ?? "5010"} and mapped Purchases / COGS.`
        : `Mapped Purchases / COGS to ${acct?.account_code ?? "expense account"}.`,
    );
  };

  onMount(() => {
    const focus = String(searchParams.focus ?? "");
    if (focus === "purchase" || focus === "mappings") {
      setDefaultsOpen(true);
      queueMicrotask(() => {
        document.getElementById("default-account-mappings")?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (focus === "purchase") {
          document.getElementById("default-slot-purchase_account_id")?.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
        }
      });
    }
  });

  const currentRows = createMemo(() => list.data?.rows ?? []);
  const isEmpty = createMemo(() => !list.isFetching && (list.data?.total ?? 0) === 0 && !q() && !typeFilter());
  const selectedRow = createMemo(() => currentRows().find((r) => r.id === selectedId()) ?? null);

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["finance-accounts"] });
    void client.invalidateQueries({ queryKey: ["finance-accounts-parent-options"] });
    void client.invalidateQueries({ queryKey: ["finance-account-defaults"] });
  };

  const openCreate = (seed?: {
    account_type?: AccountRow["account_type"];
    account_code?: string;
    account_name?: string;
    mapSlot?: DefaultAccountSlotKey;
  }) => {
    setEditingId(null);
    setPendingMapSlot(seed?.mapSlot ?? null);
    setForm({
      account_code: seed?.account_code ?? "",
      account_name: seed?.account_name ?? "",
      account_type: seed?.account_type ?? "asset",
      parent_id: "",
      is_group: false,
      is_active: true,
      sort_order: "0",
    });
    setModalOpen(true);
  };

  const openCreateFromMapping = (slot: DefaultSlot, query: string) => {
    const trimmed = query.trim();
    const codeMatch = trimmed.match(/^(\d{3,6})\s*[-–:]?\s*(.*)$/);
    openCreate({
      mapSlot: slot.key,
      account_type: slot.types[0] ?? "expense",
      account_code: codeMatch?.[1] ?? "",
      account_name: (codeMatch?.[2] ?? trimmed).trim(),
    });
  };

  const openEdit = (row: AccountRow) => {
    setPendingMapSlot(null);
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

  type AccountFormDraft = {
    account_code: string;
    account_name: string;
    account_type: AccountRow["account_type"];
    parent_id: string;
    is_group: boolean;
    is_active: boolean;
    sort_order: string;
  };

  const accountDraft = useDocumentDraft<AccountFormDraft>({
    entityType: DRAFT_ENTITY.finAccount,
    draftKey: () => {
      if (editingId()) return `edit-${editingId()}`;
      // Isolate mapping "Add account" seeds from the plain New-account draft.
      if (pendingMapSlot()) return `new-map-${pendingMapSlot()}`;
      return "new";
    },
    getPayload: () => form(),
    onApply: (payload) => setForm({ ...payload }),
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !pendingMapSlot(),
  });

  const save = async () => {
    const editId = editingId();
    const mapSlot = pendingMapSlot();
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
    const created = res.data;
    if (!editId && created?.id && mapSlot) {
      setMappingsDirty(true);
      setDefaultsForm((d) => ({ ...d, [mapSlot]: created.id }));
      setMapLabels((m) => ({ ...m, [mapSlot]: accountLabel(created) }));
      setPendingMapSlot(null);
    }
    await accountDraft.clearOnSave();
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
    }, { silent: true });
    setImporting(false);
    if (!res.success) {
      const detail = res.errors?.template || (res.errors ? Object.values(res.errors).filter(Boolean).join(" · ") : "");
      toast.warning(detail || res.message || "Failed to import template.");
      return;
    }
    toast.success(`Imported ${res.data?.imported ?? 0} accounts.`);
    invalidate();
  };

  // Autosave only while dirty; recovery still loads on mount. autoApply restores mappings
  // after a tab switch / remount so the server refetch cannot wipe unsaved picks.
  const defaultsDraft = useDocumentDraft({
    entityType: DRAFT_ENTITY.financeDefaults,
    draftKey: "defaults",
    getPayload: defaultsForm,
    onApply: (payload) => {
      setDefaultsForm(payload);
      setMappingsDirty(true);
    },
    enabled: () => mappingsDirty(),
    autoApply: () => true,
    localOnly: true,
  });

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
    setMappingsDirty(false);
    await defaultsDraft.clearOnSave();
    void client.invalidateQueries({ queryKey: ["finance-account-defaults"] });
  };

  const setDefaultSlot = (key: DefaultAccountSlotKey, id: number | null, label = "") => {
    setMappingsDirty(true);
    setDefaultsForm((d) => ({ ...d, [key]: id }));
    setMapLabels((m) => ({ ...m, [key]: label }));
  };

  const setTypeEnabled = (type: AccountRow["account_type"], enabled: boolean) => {
    if (CORE_ACCOUNT_TYPES.includes(type) && !enabled) {
      toast.warning("Asset, liability, income, and expense stay available for posting.");
      return;
    }
    setMappingsDirty(true);
    setDefaultsForm((d) => {
      const current = new Set((d.disabled_account_types ?? []).map((t) => t.toLowerCase()));
      if (enabled) current.delete(type);
      else current.add(type);
      return { ...d, disabled_account_types: [...current] };
    });
  };

  const deactivateAllOfType = async () => {
    const t = typeFilter() as AccountRow["account_type"];
    if (!t || !accountTypeOptions.includes(t)) {
      toast.warning("Filter by an account type first, then deactivate all of that type.");
      return;
    }
    if (!window.confirm(`Deactivate all active ${t} accounts? They will leave mapping dropdowns until reactivated.`)) return;
    const res = await apiFetch<AccountRow[]>(
      `/api/v1/finance/accounts?page=1&pageSize=2000&status=active&account_type=${t}&sort=account_code&order=asc`,
    );
    if (!res.success || !res.data?.length) {
      toast.warning(res.message ?? "No active accounts of that type.");
      return;
    }
    let failed = 0;
    for (const row of res.data) {
      const patch = await apiFetch(`/api/v1/finance/accounts/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      });
      if (!patch.success) failed += 1;
    }
    invalidate();
    if (failed) toast.warning(`Deactivated with ${failed} failure(s).`);
    else toast.success(`Deactivated ${res.data.length} ${t} account(s).`);
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
              onClick={() => openCreate()}
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

      <Show when={!isEmpty() && purchaseNeedsEnsure()}>
        <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p class="font-medium">Purchases / COGS needs an expense account</p>
          <p class="mt-1 text-amber-900/80">
            Click <span class="font-medium">Create Purchases / COGS (5010)</span> to add and map an expense account.
            You can change the dropdown to any other expense account afterward.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              disabled={ensuringPurchaseCogs()}
              onClick={() => {
                setDefaultsOpen(true);
                void ensurePurchaseCogs();
              }}
            >
              {ensuringPurchaseCogs() ? "Creating…" : "Create Purchases / COGS (5010)"}
            </button>
            <button
              type="button"
              class="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
              onClick={() => {
                setDefaultsOpen(true);
                queueMicrotask(() =>
                  document.getElementById("default-account-mappings")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
            >
              Jump to mappings
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
          onClick={() => void deactivateAllOfType()}
        >
          Deactivate all of filtered type
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
        <Show when={isEmpty()}>
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
        <div id="default-account-mappings" class="mb-4 scroll-mt-4 rounded-xl border border-stroke bg-white shadow-sm">
          <button
            type="button"
            class="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setDefaultsOpen((v) => !v)}
          >
            <div>
              <p class="text-sm font-medium text-slate-800">Default account mappings (incl. Purchases / COGS)</p>
              <p class="text-xs text-slate-500">
                Used by sales, purchases, receipts, and POS auto-posting. {defaultsMappedCount()} of {DEFAULT_SLOTS.length} mapped.
              </p>
            </div>
            <span class="text-sm text-slate-400">{defaultsOpen() ? "▾" : "▸"}</span>
          </button>
          <Show when={defaultsOpen()}>
            <div class="border-t border-stroke px-4 py-4">
              <defaultsDraft.DraftBanner />
              <div class="mb-4 rounded-lg border border-stroke bg-slate-50 px-3 py-3">
                <p class="text-sm font-medium text-slate-800">Account types in use</p>
                <p class="mt-1 text-xs text-slate-500">
                  Uncheck types you do not need. They leave create/mapping pickers so lists stay short. Existing accounts
                  remain on the chart (filter by type or Inactive). Equity is optional; core types stay on for posting.
                </p>
                <div class="mt-3 flex flex-wrap gap-4">
                  <For each={accountTypeOptions}>
                    {(t) => (
                      <label class="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={isTypeEnabled(t)}
                          disabled={CORE_ACCOUNT_TYPES.includes(t)}
                          onChange={(e) => setTypeEnabled(t, e.currentTarget.checked)}
                        />
                        <span class="capitalize">
                          {t}
                          <Show when={OPTIONAL_ACCOUNT_TYPES.includes(t)}>
                            <span class="text-slate-400"> (optional)</span>
                          </Show>
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              </div>
              <p class="mb-3 text-xs text-slate-500">
                Map each role to an active account. Importing the Philippine SME template fills these automatically; adjust if needed.
                Purchases / COGS must be an <span class="font-medium">expense</span> account (not inventory asset 1469).
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <For each={DEFAULT_SLOTS}>
                  {(slot) => (
                    <div
                      id={`default-slot-${slot.key}`}
                      class="block rounded-lg p-1 text-sm"
                      classList={{
                        "bg-amber-50":
                          slot.key === "purchase_account_id" &&
                          (purchaseNeedsEnsure() || String(searchParams.focus ?? "") === "purchase"),
                      }}
                    >
                      <LookupCombo
                        label={slot.label}
                        value={() => mapLabels()[slot.key] ?? ""}
                        selectedId={() => defaultsForm()[slot.key] ?? null}
                        onInput={(text) => {
                          setMapLabels((m) => ({ ...m, [slot.key]: text }));
                          if (defaultsForm()[slot.key] != null) {
                            setDefaultSlot(slot.key, null, text);
                          } else {
                            setMappingsDirty(true);
                          }
                        }}
                        onSelect={(opt) => setDefaultSlot(slot.key, opt.id, opt.label)}
                        onClear={() => setDefaultSlot(slot.key, null, "")}
                        fetchOptions={(q) => fetchAccountsForSlot(slot.types, q)}
                        placeholder={`Search ${slot.label.toLowerCase()}…`}
                        createLabel="Add account"
                        onCreate={(q) => openCreateFromMapping(slot, q)}
                      />
                      <p class="mt-1 px-0.5 text-xs text-slate-500">{slot.hint}</p>
                      <Show when={slot.key === "purchase_account_id" && purchaseNeedsEnsure()}>
                        <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                          <p class="font-medium">
                            {purchaseCogsEmpty()
                              ? "No active expense accounts available"
                              : "Purchases / COGS is not mapped to an expense account"}
                          </p>
                          <p class="mt-0.5 text-amber-900/80">
                            Click Create to add <span class="font-medium">5010</span> (or the next free 50xx) and map it,
                            or use <span class="font-medium">Add account</span> in the search box above.
                          </p>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              class="rounded-md bg-amber-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                              disabled={ensuringPurchaseCogs()}
                              onClick={() => void ensurePurchaseCogs()}
                            >
                              {ensuringPurchaseCogs() ? "Creating…" : "Create Purchases / COGS (5010)"}
                            </button>
                          </div>
                        </div>
                      </Show>
                    </div>
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
        onNew={() => openCreate()}
        onEdit={openEdit}
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
        onClose={() => {
          setPendingMapSlot(null);
          setModalOpen(false);
        }}
        onSave={() => void save()}
        saving={saving()}
      >
        <ModalMessage>
          <accountDraft.DraftBanner />
        </ModalMessage>
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
            <For
              each={
                enabledAccountTypes().includes(form().account_type)
                  ? enabledAccountTypes()
                  : [...enabledAccountTypes(), form().account_type]
              }
            >
              {(t) => <option value={t}>{t} ({PH_BANDS[t]})</option>}
            </For>
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
