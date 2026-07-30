import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";

type BankAccount = {
  id: number;
  bank_account_code: string;
  bank_account_name: string;
  account_type: "bank" | "credit_card" | "e_wallet" | string;
  institution_name: string;
  account_number: string;
  gl_account_code: string;
  gl_account_name?: string;
  keyword?: string | null;
  remark?: string | null;
  is_active: boolean;
};

type GLAccount = { account_code: string; account_name: string };

const ACCOUNT_TYPES = [
  { value: "", label: "All types" },
  { value: "bank", label: "Bank" },
  { value: "credit_card", label: "Credit card" },
  { value: "e_wallet", label: "E-wallet" },
] as const;

const WALLET_PRESETS = ["GCash", "Maya", "PayPal", "GrabPay", "ShopeePay", "Other wallet"];

function typeLabel(t: string) {
  if (t === "credit_card") return "Credit card";
  if (t === "e_wallet") return "E-wallet";
  return "Bank";
}

function emptyForm() {
  return {
    bank_account_code: "",
    bank_account_name: "",
    account_type: "bank",
    institution_name: "",
    account_number: "",
    gl_account_code: "",
    keyword: "",
    remark: "",
  };
}

export default function BankingPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [typeFilter, setTypeFilter] = createSignal("");
  const [q, setQ] = createSignal("");
  const [formOpen, setFormOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<BankAccount | null>(null);
  const [form, setForm] = createSignal(emptyForm());
  const [saving, setSaving] = createSignal(false);

  const list = createQuery(() => ({
    queryKey: ["banking-accounts", typeFilter(), q()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: "1",
        pageSize: "200",
        sort: "bank_account_name",
        order: "asc",
        include_inactive: "true",
      });
      if (typeFilter()) qs.set("account_type", typeFilter());
      if (q().trim()) qs.set("q", q().trim());
      const res = await apiFetch<BankAccount[]>(`/api/v1/finance/bank-accounts?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load accounts");
      return res.data ?? [];
    },
  }));

  const glAccounts = createQuery(() => ({
    queryKey: ["finance-gl-accounts"],
    queryFn: async () => {
      const res = await apiFetch<GLAccount[]>("/api/v1/finance/gl-accounts");
      if (!res.success) throw new Error(res.message ?? "Failed to load GL accounts");
      return res.data ?? [];
    },
  }));

  const grouped = createMemo(() => {
    const rows = list.data ?? [];
    return {
      bank: rows.filter((r) => r.account_type === "bank"),
      credit_card: rows.filter((r) => r.account_type === "credit_card"),
      e_wallet: rows.filter((r) => r.account_type === "e_wallet"),
      other: rows.filter((r) => !["bank", "credit_card", "e_wallet"].includes(r.account_type)),
    };
  });

  const openCreate = (presetType = "bank") => {
    setEditing(null);
    setForm({ ...emptyForm(), account_type: presetType });
    setFormOpen(true);
  };

  const openEdit = (row: BankAccount) => {
    setEditing(row);
    setForm({
      bank_account_code: row.bank_account_code,
      bank_account_name: row.bank_account_name,
      account_type: row.account_type || "bank",
      institution_name: row.institution_name || "",
      account_number: row.account_number || "",
      gl_account_code: row.gl_account_code,
      keyword: row.keyword ?? "",
      remark: row.remark ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    const f = form();
    if (!f.bank_account_name.trim()) {
      toast.warning("Account name is required.");
      return;
    }
    if (!editing() && !f.bank_account_code.trim()) {
      toast.warning("Account code is required.");
      return;
    }
    if (!f.gl_account_code) {
      toast.warning("Select a GL account.");
      return;
    }
    setSaving(true);
    const body = {
      bank_account_code: f.bank_account_code.trim(),
      bank_account_name: f.bank_account_name.trim(),
      account_type: f.account_type,
      institution_name: f.institution_name.trim(),
      account_number: f.account_number.trim(),
      gl_account_code: f.gl_account_code,
      keyword: f.keyword.trim() || null,
      remark: f.remark.trim() || null,
    };
    const ed = editing();
    const res = ed
      ? await apiFetch(`/api/v1/finance/bank-accounts/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch("/api/v1/finance/bank-accounts", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save account.");
      return;
    }
    toast.success(ed ? "Account updated." : "Account added.");
    setFormOpen(false);
    void client.invalidateQueries({ queryKey: ["banking-accounts"] });
    void client.invalidateQueries({ queryKey: ["finance-bank-accounts-options"] });
    void client.invalidateQueries({ queryKey: ["bank-accounts-pv"] });
    void client.invalidateQueries({ queryKey: ["bank-accounts-mini"] });
  };

  const deactivate = async (row: BankAccount) => {
    if (!confirm(`Deactivate “${row.bank_account_name}”?`)) return;
    const res = await apiFetch(`/api/v1/finance/bank-accounts/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false, bank_account_name: row.bank_account_name, gl_account_code: row.gl_account_code }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Could not deactivate.");
      return;
    }
    toast.success("Account deactivated.");
    void client.invalidateQueries({ queryKey: ["banking-accounts"] });
  };

  const AccountCard = (props: { row: BankAccount }) => (
    <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{typeLabel(props.row.account_type)}</p>
          <h3 class="mt-1 text-base font-semibold text-text-primary">{props.row.bank_account_name}</h3>
          <p class="text-sm text-text-secondary">{props.row.bank_account_code}</p>
        </div>
        <Show when={!props.row.is_active}>
          <span class="rounded bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">Inactive</span>
        </Show>
      </div>
      <dl class="mt-3 space-y-1 text-sm">
        <Show when={props.row.institution_name}>
          <div class="flex justify-between gap-2">
            <dt class="text-text-secondary">Institution</dt>
            <dd>{props.row.institution_name}</dd>
          </div>
        </Show>
        <Show when={props.row.account_number}>
          <div class="flex justify-between gap-2">
            <dt class="text-text-secondary">Number</dt>
            <dd class="font-mono text-xs">{props.row.account_number}</dd>
          </div>
        </Show>
        <div class="flex justify-between gap-2">
          <dt class="text-text-secondary">GL</dt>
          <dd class="text-right">
            {props.row.gl_account_code}
            <Show when={props.row.gl_account_name}>
              <span class="block text-xs text-text-secondary">{props.row.gl_account_name}</span>
            </Show>
          </dd>
        </div>
      </dl>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => openEdit(props.row)}>
          Edit
        </button>
        <A href="/app/finance/acct-i/bank-reconciliation" class="text-sm text-text-secondary hover:underline">
          Reconcile
        </A>
        <Show when={props.row.is_active}>
          <button type="button" class="text-sm text-red-600 hover:underline" onClick={() => void deactivate(props.row)}>
            Deactivate
          </button>
        </Show>
      </div>
    </div>
  );

  const Section = (props: { title: string; rows: BankAccount[] }) => (
    <Show when={props.rows.length > 0}>
      <section class="space-y-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-text-secondary">{props.title}</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <For each={props.rows}>{(row) => <AccountCard row={row} />}</For>
        </div>
      </section>
    </Show>
  );

  return (
    <div class="space-y-6 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Banking</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Manage bank accounts, credit cards, and e-wallets (GCash, Maya, PayPal, and more). Use these accounts on receipts, payments, and reconciliation.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
            onClick={() => openCreate("e_wallet")}
          >
            Add e-wallet
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => openCreate("bank")}
          >
            Add bank or card
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <input
          type="search"
          class="min-w-[12rem] flex-1 rounded-lg border border-stroke px-3 py-2 text-sm sm:max-w-xs"
          placeholder="Search accounts…"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <select
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          value={typeFilter()}
          onChange={(e) => setTypeFilter(e.currentTarget.value)}
        >
          <For each={[...ACCOUNT_TYPES]}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
        </select>
        <A
          href="/app/finance/acct-i/bank-reconciliation"
          class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
        >
          Bank reconciliation
        </A>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={list.isError}>
          <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <Show
          when={(list.data ?? []).length > 0}
          fallback={
            <div class="rounded-xl border border-dashed border-stroke bg-slate-50 px-6 py-10 text-center">
              <p class="text-sm font-medium text-text-primary">No banking accounts yet</p>
              <p class="mt-1 text-sm text-text-secondary">Add your BPI/BDO account, GCash, Maya, or PayPal to start.</p>
              <button
                type="button"
                class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                onClick={() => openCreate("bank")}
              >
                Add account
              </button>
            </div>
          }
        >
          <div class="space-y-8">
            <Section title="Banks" rows={grouped().bank} />
            <Section title="Credit cards" rows={grouped().credit_card} />
            <Section title="E-wallets" rows={grouped().e_wallet} />
            <Section title="Other" rows={grouped().other} />
          </div>
        </Show>
      </Show>

      <Show when={formOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">{editing() ? "Edit account" : "Add account"}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setFormOpen(false)}>
                Close
              </button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Account type</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().account_type}
                onChange={(e) => setForm({ ...form(), account_type: e.currentTarget.value })}
              >
                <option value="bank">Bank</option>
                <option value="credit_card">Credit card</option>
                <option value="e_wallet">E-wallet</option>
              </select>
            </label>
            <Show when={!editing()}>
              <label class="mb-3 block text-sm">
                <span class="text-text-secondary">Account code</span>
                <input
                  class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                  value={form().bank_account_code}
                  onInput={(e) => setForm({ ...form(), bank_account_code: e.currentTarget.value })}
                  placeholder="e.g. BPI-01, GCASH-MAIN"
                />
              </label>
            </Show>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Display name</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().bank_account_name}
                onInput={(e) => setForm({ ...form(), bank_account_name: e.currentTarget.value })}
                placeholder="e.g. BPI Checking, GCash Operations"
              />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">
                {form().account_type === "e_wallet" ? "Wallet provider" : "Bank / institution"}
              </span>
              <Show
                when={form().account_type === "e_wallet"}
                fallback={
                  <input
                    class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                    value={form().institution_name}
                    onInput={(e) => setForm({ ...form(), institution_name: e.currentTarget.value })}
                    placeholder="BPI, BDO, Metrobank…"
                  />
                }
              >
                <select
                  class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                  value={WALLET_PRESETS.includes(form().institution_name) ? form().institution_name : form().institution_name ? "Other wallet" : ""}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setForm({
                      ...form(),
                      institution_name: v === "Other wallet" ? form().institution_name || "" : v,
                    });
                  }}
                >
                  <option value="">Select…</option>
                  <For each={WALLET_PRESETS}>{(w) => <option value={w}>{w}</option>}</For>
                </select>
                <Show when={!WALLET_PRESETS.slice(0, -1).includes(form().institution_name)}>
                  <input
                    class="mt-2 w-full rounded border border-stroke px-2 py-1.5"
                    value={form().institution_name}
                    onInput={(e) => setForm({ ...form(), institution_name: e.currentTarget.value })}
                    placeholder="Custom wallet name"
                  />
                </Show>
              </Show>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Account / mobile number</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().account_number}
                onInput={(e) => setForm({ ...form(), account_number: e.currentTarget.value })}
                placeholder="Optional"
              />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">GL account</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().gl_account_code}
                onChange={(e) => setForm({ ...form(), gl_account_code: e.currentTarget.value })}
              >
                <option value="">Select…</option>
                <For each={glAccounts.data ?? []}>
                  {(g) => (
                    <option value={g.account_code}>
                      {g.account_code} — {g.account_name}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Keyword</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().keyword}
                onInput={(e) => setForm({ ...form(), keyword: e.currentTarget.value })}
              />
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Remark</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={form().remark}
                onInput={(e) => setForm({ ...form(), remark: e.currentTarget.value })}
              />
            </label>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : editing() ? "Save changes" : "Add account"}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
