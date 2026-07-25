import { For, Show, createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A, useSearchParams } from "@solidjs/router";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { formatMoney } from "../../shared/money";
import { useToast } from "../../shared/toast";
import { apiFetch } from "../../shared/api";

type CommissionRule = {
  id: number;
  name: string;
  salesperson_user_id?: number | null;
  item_category_id?: number | null;
  item_category_name?: string | null;
  rate_pct: number;
  active: boolean;
};

type CommissionAccrual = {
  id: number;
  sales_id: number;
  sales_no: string;
  order_date?: string;
  rule_id?: number | null;
  rule_name?: string | null;
  beneficiary_name: string;
  base_amount: number;
  commission_amount: number;
  status: string;
  journal_entry_id?: number | null;
  journal_entry_no?: string | null;
  source: string;
  paid_at?: string | null;
  created_at?: string;
};

type CommissionAccounting = {
  commission_expense_account_id?: number | null;
  commission_expense_label?: string;
  commission_payable_account_id?: number | null;
  commission_payable_label?: string;
  auto_post_commission_journal: boolean;
  accounts_mapped: boolean;
};

type ItemCategory = { id: number; code: string; name: string };
type FinAccount = { id: number; account_code: string; account_name: string; account_type: string };

type Tab = "register" | "rules" | "accounting";

async function fetchUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name, sublabel: u.email }));
}

async function fetchAccounts(type: "expense" | "liability", q: string): Promise<LookupOption[]> {
  const params = new URLSearchParams({ pageSize: "40", account_type: type });
  if (q.trim()) params.set("q", q.trim());
  const res = await apiFetch<{ rows: FinAccount[] }>(`/api/v1/finance/accounts?${params}`);
  return (res.data?.rows ?? []).map((a) => ({
    id: a.id,
    label: `${a.account_code} ${a.account_name}`,
    sublabel: a.account_type,
  }));
}

export default function CommissionRulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (): Tab => {
    const t = String(searchParams.tab ?? "register");
    if (t === "rules" || t === "accounting") return t;
    return "register";
  };
  const setTab = (t: Tab) => setSearchParams({ tab: t });

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [checkedIds, setCheckedIds] = createSignal<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [ratePct, setRatePct] = createSignal("5");
  const [salespersonId, setSalespersonId] = createSignal<number | null>(null);
  const [salespersonLabel, setSalespersonLabel] = createSignal("");
  const [categoryId, setCategoryId] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [statusFilter, setStatusFilter] = createSignal("all");
  const [glFilter, setGlFilter] = createSignal("");
  const [q, setQ] = createSignal("");
  const [expId, setExpId] = createSignal<number | null>(null);
  const [expLabel, setExpLabel] = createSignal("");
  const [payId, setPayId] = createSignal<number | null>(null);
  const [payLabel, setPayLabel] = createSignal("");
  const [autoPost, setAutoPost] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const categories = createQuery(() => ({
    queryKey: ["item-categories"],
    queryFn: async () => {
      const res = await apiFetch<ItemCategory[]>("/api/v1/inventory/item-categories");
      if (!res.success) throw new Error(res.message ?? "Failed to load categories");
      return res.data ?? [];
    },
  }));

  const list = createQuery(() => ({
    queryKey: ["commission-rules"],
    queryFn: async () => {
      const res = await apiFetch<CommissionRule[]>("/api/v1/sales/commission-rules");
      if (!res.success) throw new Error(res.message ?? "Failed to load rules");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const accruals = createQuery(() => ({
    queryKey: ["commission-accruals", statusFilter(), glFilter(), q()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter() !== "all") params.set("status", statusFilter());
      if (glFilter()) params.set("gl", glFilter());
      if (q().trim()) params.set("q", q().trim());
      const res = await apiFetch<CommissionAccrual[]>(`/api/v1/sales/commission-accruals?${params}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load accruals");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const accounting = createQuery(() => ({
    queryKey: ["commission-accounting"],
    queryFn: async () => {
      const res = await apiFetch<CommissionAccounting>("/api/v1/sales/commission-accounting");
      if (!res.success) throw new Error(res.message ?? "Failed to load accounting settings");
      const d = res.data ?? {
        auto_post_commission_journal: false,
        accounts_mapped: false,
      };
      setExpId(d.commission_expense_account_id ?? null);
      setExpLabel(d.commission_expense_label ?? "");
      setPayId(d.commission_payable_account_id ?? null);
      setPayLabel(d.commission_payable_label ?? "");
      setAutoPost(!!d.auto_post_commission_journal);
      return d;
    },
  }));

  const openNew = () => {
    setName("");
    setRatePct("5");
    setSalespersonId(null);
    setSalespersonLabel("");
    setCategoryId(null);
    setModalOpen(true);
  };

  const saveRule = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CommissionRule>("/api/v1/sales/commission-rules", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        rate_pct: Number(ratePct()) || 0,
        salesperson_user_id: salespersonId() || null,
        item_category_id: categoryId() || null,
        active: true,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create rule.");
      return;
    }
    toast.success("Commission rule created.");
    setModalOpen(false);
    void client.invalidateQueries({ queryKey: ["commission-rules"] });
  };

  const saveAccounting = async () => {
    setSaving(true);
    const res = await apiFetch<CommissionAccounting>("/api/v1/sales/commission-accounting", {
      method: "PUT",
      body: JSON.stringify({
        commission_expense_account_id: expId(),
        commission_payable_account_id: payId(),
        auto_post_commission_journal: autoPost(),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save accounting settings.");
      return;
    }
    toast.success("Commission accounts saved.");
    void client.invalidateQueries({ queryKey: ["commission-accounting"] });
  };

  const markPaid = async (row: CommissionAccrual) => {
    const res = await apiFetch(`/api/v1/sales/commission-accruals/${row.id}/mark-paid`, { method: "POST" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to mark paid.");
      return;
    }
    toast.success("Marked paid.");
    void client.invalidateQueries({ queryKey: ["commission-accruals"] });
  };

  const postGl = async (row: CommissionAccrual) => {
    const res = await apiFetch("/api/v1/sales/commission-accruals/post-gl", {
      method: "POST",
      body: JSON.stringify({ sales_id: row.sales_id }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to post to GL.");
      return;
    }
    toast.success("Commission journal created.");
    void client.invalidateQueries({ queryKey: ["commission-accruals"] });
  };

  const postGlSelected = async () => {
    const ids = checkedIds();
    const rows = (accruals.data?.rows ?? []).filter((r) => ids.has(r.id) && !r.journal_entry_id && r.status === "accrued");
    if (rows.length === 0) {
      toast.warning("Select accrued commissions that are not yet in GL.");
      return;
    }
    if (!accounting.data?.accounts_mapped) {
      toast.warning("Map expense and payable accounts under Accounting first.");
      setTab("accounting");
      return;
    }
    const salesIds = [...new Set(rows.map((r) => r.sales_id))];
    let ok = 0;
    for (const salesId of salesIds) {
      const res = await apiFetch("/api/v1/sales/commission-accruals/post-gl", {
        method: "POST",
        body: JSON.stringify({ sales_id: salesId }),
      });
      if (res.success) ok += 1;
    }
    toast.success(`Posted GL for ${ok} of ${salesIds.length} sale(s).`);
    setCheckedIds(new Set<number>());
    void client.invalidateQueries({ queryKey: ["commission-accruals"] });
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      class={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        tab() === id ? "bg-brand-700 text-white" : "bg-white text-text-secondary border border-stroke hover:bg-slate-50"
      }`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div class="space-y-4">
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Commissions</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Register of commissions per completed sale (whole invoice or per item), automatic rules, and Chart of Accounts mapping. Use checkboxes to Post GL into the mapped expense/payable accounts.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {tabBtn("register", "Register")}
            {tabBtn("rules", "Rules")}
            {tabBtn("accounting", "Accounting")}
          </div>
        </div>
        <Show when={!accounting.data?.accounts_mapped && !accounting.isFetching}>
          <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Map expense and payable accounts under the{" "}
            <button type="button" class="font-medium underline" onClick={() => setTab("accounting")}>
              Accounting
            </button>{" "}
            tab so commissions can post to the general ledger.
          </p>
        </Show>
      </section>

      <Show when={tab() === "register"}>
        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-3">
          <label class="text-sm">
            <span class="mb-1 block text-text-secondary">Status</span>
            <select class={inputClass} value={statusFilter()} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
              <option value="all">All</option>
              <option value="accrued">Accrued</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label class="text-sm">
            <span class="mb-1 block text-text-secondary">GL</span>
            <select class={inputClass} value={glFilter()} onChange={(e) => setGlFilter(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="pending">Not in GL</option>
              <option value="posted">In GL</option>
            </select>
          </label>
          <label class="min-w-[12rem] flex-1 text-sm">
            <span class="mb-1 block text-text-secondary">Search</span>
            <input
              class={inputClass}
              placeholder="Sales no or person…"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </label>
        </div>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h3 class="text-sm font-semibold text-text-primary">Chart of accounts (tenant)</h3>
          <p class="mt-1 text-xs text-text-secondary">
            Checked rows post into these accounts. Change mapping here, save, then Post GL for selection.
          </p>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <LookupCombo
              label="Commission expense"
              value={() => expLabel()}
              selectedId={() => expId()}
              onInput={setExpLabel}
              onSelect={(o) => {
                setExpId(o.id);
                setExpLabel(o.label);
              }}
              onClear={() => {
                setExpId(null);
                setExpLabel("");
              }}
              fetchOptions={(q) => fetchAccounts("expense", q)}
              placeholder="Search expense account…"
            />
            <LookupCombo
              label="Commission payable"
              value={() => payLabel()}
              selectedId={() => payId()}
              onInput={setPayLabel}
              onSelect={(o) => {
                setPayId(o.id);
                setPayLabel(o.label);
              }}
              onClear={() => {
                setPayId(null);
                setPayLabel("");
              }}
              fetchOptions={(q) => fetchAccounts("liability", q)}
              placeholder="Search liability account…"
            />
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void saveAccounting()}
            >
              Save COA mapping
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              disabled={checkedIds().size === 0}
              onClick={() => void postGlSelected()}
            >
              Post GL for selected ({checkedIds().size})
            </button>
            <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setTab("accounting")}>
              Full accounting settings
            </button>
          </div>
        </section>
        <SpreadsheetGrid<CommissionAccrual>
          columns={[
            {
              key: "sales_no",
              header: "Sale",
              clickable: true,
              exportValue: (r) => r.sales_no || `#${r.sales_id}`,
              render: (r) => (
                <A class="text-brand-700 underline" href={`/app/sales/sales?highlight=${r.sales_id}`}>
                  {r.sales_no || `#${r.sales_id}`}
                </A>
              ),
            },
            { key: "order_date", header: "Date", render: (r) => r.order_date ?? "—", exportValue: (r) => r.order_date ?? "" },
            {
              key: "beneficiary_name",
              header: "Person",
              render: (r) => r.beneficiary_name || "—",
              exportValue: (r) => r.beneficiary_name || "",
            },
            {
              key: "source",
              header: "Source",
              render: (r) => (r.source === "line" ? "Sale line" : r.rule_name || "Rule"),
              exportValue: (r) => (r.source === "line" ? "Sale line" : r.rule_name || "Rule"),
            },
            {
              key: "base_amount",
              header: "Base",
              render: (r) => formatMoney(r.base_amount),
              exportValue: (r) => r.base_amount,
            },
            {
              key: "commission_amount",
              header: "Commission",
              render: (r) => formatMoney(r.commission_amount),
              exportValue: (r) => r.commission_amount,
            },
            {
              key: "journal_entry_no",
              header: "Journal",
              render: (r) =>
                r.journal_entry_no ? (
                  <A class="text-brand-700 underline" href={`/app/finance/journal-entries?highlight=${r.journal_entry_id}`}>
                    {r.journal_entry_no}
                  </A>
                ) : (
                  <span class="text-text-secondary">—</span>
                ),
              exportValue: (r) => r.journal_entry_no ?? "",
            },
            {
              key: "status",
              header: "Status",
              render: (r) => <span class="capitalize">{r.status}</span>,
              exportValue: (r) => r.status,
            },
            {
              key: "actions",
              header: "Actions",
              sortable: false,
              render: (r) => (
                <div class="flex flex-wrap gap-1">
                  <Show when={!r.journal_entry_id && r.status === "accrued"}>
                    <button
                      type="button"
                      class="rounded border border-stroke px-2 py-0.5 text-xs hover:bg-slate-50"
                      onClick={() => void postGl(r)}
                    >
                      Post GL
                    </button>
                  </Show>
                  <Show when={r.status === "accrued"}>
                    <button
                      type="button"
                      class="rounded border border-stroke px-2 py-0.5 text-xs hover:bg-slate-50"
                      onClick={() => void markPaid(r)}
                    >
                      Mark paid
                    </button>
                  </Show>
                </div>
              ),
            },
          ]}
          rows={accruals.data?.rows ?? []}
          loading={accruals.isFetching}
          selectedId={null}
          onSelect={() => {}}
          selectable
          selectedIds={checkedIds()}
          onSelectionChange={setCheckedIds}
          onNew={() => setTab("rules")}
          onEdit={() => {}}
          codeKey="sales_no"
          nameKey="beneficiary_name"
          total={accruals.data?.total ?? 0}
          search=""
          onSearchChange={() => {}}
          onRefresh={() => void client.invalidateQueries({ queryKey: ["commission-accruals"] })}
          exportFilename="commissions-register"
          exportTitle="Commissions register"
        />
      </Show>

      <Show when={tab() === "rules"}>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <h3 class="text-base font-semibold text-text-primary">Automatic commission rules</h3>
          <p class="mt-1 text-sm text-text-secondary">
            Accrue on completed sales by salesperson (PIC), item category, or both. Per-sale TIC lines on the Sales form
            (whole sale or per item) also appear in the Register.
          </p>
        </section>
        <SpreadsheetGrid<CommissionRule>
          columns={[
            { key: "name", header: "Name", clickable: true },
            { key: "item_category_name", header: "Category", render: (r) => r.item_category_name ?? "All" },
            { key: "rate_pct", header: "Rate %", render: (r) => `${r.rate_pct}%` },
            { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onNew={openNew}
          onEdit={() => {}}
          codeKey="name"
          nameKey="name"
          total={list.data?.total ?? 0}
          search=""
          onSearchChange={() => {}}
          onRefresh={() => void client.invalidateQueries({ queryKey: ["commission-rules"] })}
        />
      </Show>

      <Show when={tab() === "accounting"}>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm space-y-4 max-w-2xl">
          <div>
            <h3 class="text-base font-semibold text-text-primary">Chart of Accounts mapping</h3>
            <p class="mt-1 text-sm text-text-secondary">
              One mapping for the tenant. When a sale is completed, commissions debit expense and credit payable. Default
              PH template uses <code class="text-xs">5105 Sales Commissions</code> and{" "}
              <code class="text-xs">2020 Accrued Expenses</code>.
            </p>
          </div>
          <LookupCombo
            label="Commission expense (debit) *"
            value={expLabel}
            selectedId={expId}
            onInput={setExpLabel}
            onSelect={(o) => {
              setExpId(o.id);
              setExpLabel(o.label);
            }}
            onClear={() => {
              setExpId(null);
              setExpLabel("");
            }}
            fetchOptions={(q) => fetchAccounts("expense", q)}
          />
          <LookupCombo
            label="Commissions payable (credit) *"
            value={payLabel}
            selectedId={payId}
            onInput={setPayLabel}
            onSelect={(o) => {
              setPayId(o.id);
              setPayLabel(o.label);
            }}
            onClear={() => {
              setPayId(null);
              setPayLabel("");
            }}
            fetchOptions={(q) => fetchAccounts("liability", q)}
          />
          <label class="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={autoPost()} onChange={(e) => setAutoPost(e.currentTarget.checked)} />
            Auto-post journal (otherwise leave as draft for Finance review)
          </label>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void saveAccounting()}
            >
              Save accounting
            </button>
            <A href="/app/finance/chart-of-accounts" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50">
              Open Chart of Accounts
            </A>
          </div>
        </section>
      </Show>

      <EntityModal open={modalOpen()} title="New commission rule" onClose={() => setModalOpen(false)} onSave={() => void saveRule()} saving={saving()} singleColumn>
        <Field label="Name *">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Rate %">
          <input class={inputClass} type="number" min="0" step="0.01" value={ratePct()} onInput={(e) => setRatePct(e.currentTarget.value)} />
        </Field>
        <LookupCombo
          label="Salesperson (optional — matches sale PIC)"
          value={salespersonLabel}
          selectedId={salespersonId}
          onInput={setSalespersonLabel}
          onSelect={(o) => {
            setSalespersonId(o.id);
            setSalespersonLabel(o.label);
          }}
          onClear={() => {
            setSalespersonId(null);
            setSalespersonLabel("");
          }}
          fetchOptions={fetchUsers}
        />
        <Field label="Item category (optional — commission on matching line totals)">
          <select class={inputClass} value={categoryId() ?? ""} onChange={(e) => setCategoryId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
            <option value="">All categories (grand total)</option>
            <For each={categories.data ?? []}>{(c) => <option value={String(c.id)}>{c.name}</option>}</For>
          </select>
        </Field>
      </EntityModal>
    </div>
  );
}
