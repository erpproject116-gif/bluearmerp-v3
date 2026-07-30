import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import {
  PartnerSearchModal,
  type PartnerSearchRow,
} from "../../purchase-request/purchase-request/PartnerSearchModal";

type RecurringLine = {
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
};

type RecurringInvoice = {
  id: number;
  name: string;
  partner_id?: number | null;
  customer_name: string;
  description: string;
  amount: number;
  frequency: string;
  next_run_date: string;
  end_date?: string | null;
  is_active: boolean;
  last_sales_id?: number | null;
  notes: string;
  lines?: RecurringLine[];
};

const emptyLine = (): RecurringLine => ({
  item_code: "",
  item_name: "",
  qty: 1,
  unit_price: 0,
});

const lineTotal = (lines: RecurringLine[]) =>
  lines.reduce((sum, l) => sum + (l.qty > 0 ? l.qty : 1) * (l.unit_price || 0), 0);

export default function RecurringInvoicesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [showInactive, setShowInactive] = createSignal(false);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal<RecurringInvoice | null>(null);
  const [partnerPickerOpen, setPartnerPickerOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [customerName, setCustomerName] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [description, setDescription] = createSignal("");
  const [amount, setAmount] = createSignal("0");
  const [frequency, setFrequency] = createSignal("monthly");
  const [nextRun, setNextRun] = createSignal(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = createSignal("");
  const [lines, setLines] = createSignal<RecurringLine[]>([emptyLine()]);
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [runningDue, setRunningDue] = createSignal(false);
  const [lastGenerated, setLastGenerated] = createSignal<{ sales_no: string; sales_id: number } | null>(null);
  const [previewRow, setPreviewRow] = createSignal<RecurringInvoice | null>(null);

  const list = createQuery(() => ({
    queryKey: ["recurring-invoices", showInactive()],
    queryFn: async () => {
      const qs = showInactive() ? "active=0" : "active=1";
      const res = await apiFetch<RecurringInvoice[]>(`/api/v1/finance/recurring-invoices?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load recurring invoices");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["recurring-invoices"] });

  const resetForm = () => {
    setName("");
    setCustomerName("");
    setPartnerId(null);
    setDescription("");
    setAmount("0");
    setFrequency("monthly");
    setNextRun(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setLines([emptyLine()]);
  };

  const pickPartner = (row: PartnerSearchRow) => {
    setPartnerId(row.id);
    setCustomerName(row.company_name);
  };

  const updateLine = (index: number, patch: Partial<RecurringLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const payloadFromForm = () => {
    const formLines = lines().filter((l) => l.item_name.trim() || l.item_code.trim() || l.unit_price > 0);
    const amt = formLines.length > 0 ? lineTotal(formLines) : Number(amount());
    return {
      name: name().trim(),
      customer_name: customerName().trim(),
      partner_id: partnerId(),
      description: description().trim(),
      amount: amt,
      frequency: frequency(),
      next_run_date: nextRun(),
      end_date: endDate().trim() || null,
      is_active: true,
      lines: formLines.length > 0 ? formLines : undefined,
    };
  };

  const create = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    if (!partnerId()) {
      toast.warning("Select a customer partner (required to generate invoices).");
      return;
    }
    const payload = payloadFromForm();
    if (!Number.isFinite(payload.amount) || payload.amount < 0) {
      toast.warning("Enter a valid amount or line items.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/finance/recurring-invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create schedule.");
      return;
    }
    toast.success("Recurring invoice schedule created.");
    setCreateOpen(false);
    resetForm();
    invalidate();
  };

  const saveEdit = async () => {
    const row = editOpen();
    if (!row) return;
    const payload = payloadFromForm();
    setSaving(true);
    const res = await apiFetch(`/api/v1/finance/recurring-invoices/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, lines: lines().filter((l) => l.item_name.trim() || l.item_code.trim() || l.unit_price > 0) }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update schedule.");
      return;
    }
    toast.success("Schedule updated.");
    setEditOpen(null);
    resetForm();
    invalidate();
  };

  const openEdit = async (row: RecurringInvoice) => {
    const res = await apiFetch<RecurringInvoice>(`/api/v1/finance/recurring-invoices/${row.id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not load schedule.");
      return;
    }
    const detail = res.data;
    setEditOpen(detail);
    setName(detail.name);
    setCustomerName(detail.customer_name);
    setPartnerId(detail.partner_id ?? null);
    setDescription(detail.description);
    setAmount(String(detail.amount));
    setFrequency(detail.frequency);
    setNextRun(detail.next_run_date);
    setEndDate(detail.end_date ?? "");
    setLines(detail.lines && detail.lines.length > 0 ? detail.lines : [emptyLine()]);
  };

  const generate = async (row: RecurringInvoice) => {
    if (!row.partner_id) {
      toast.warning("Link a customer partner on this schedule before generating.");
      return;
    }
    if (!confirm(`Generate a sales invoice for “${row.name}” (${formatPeso(row.amount)})?`)) return;
    setBusyId(row.id);
    const res = await apiFetch<{ sales_id: number; sales_no: string; next_run_date: string }>(
      `/api/v1/finance/recurring-invoices/${row.id}/generate`,
      { method: "POST" },
    );
    setBusyId(null);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not generate invoice.");
      return;
    }
    setLastGenerated({ sales_id: res.data.sales_id, sales_no: res.data.sales_no });
    toast.success(`Created sales ${res.data.sales_no}. Next run: ${res.data.next_run_date}.`);
    invalidate();
  };

  const runDueNow = async () => {
    if (!confirm("Generate sales invoices for all due recurring schedules?")) return;
    setRunningDue(true);
    const res = await apiFetch<{ processed: number; generated: { sales_no: string }[]; errors?: string[] }>(
      "/api/v1/finance/recurring-invoices/run-due",
      { method: "POST" },
    );
    setRunningDue(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not run due schedules.");
      return;
    }
    const count = res.data?.processed ?? 0;
    if (count === 0) {
      toast.success("No due recurring invoices to generate.");
    } else {
      toast.success(`Generated ${count} invoice(s).`);
      const last = res.data?.generated?.[res.data.generated.length - 1];
      if (last) setLastGenerated({ sales_id: 0, sales_no: last.sales_no });
    }
    if (res.data?.errors?.length) {
      toast.warning(res.data.errors.join("; "));
    }
    invalidate();
  };

  const formLinesEditor = () => (
    <div class="mb-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm text-text-secondary">Line items</span>
        <button
          type="button"
          class="text-xs text-brand-600 hover:underline"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          + Add line
        </button>
      </div>
      <div class="space-y-2">
        <For each={lines()}>
          {(line, index) => (
            <div class="grid grid-cols-12 gap-2">
              <input
                class="col-span-2 rounded border border-stroke px-2 py-1 text-xs"
                placeholder="Code"
                value={line.item_code}
                onInput={(e) => updateLine(index(), { item_code: e.currentTarget.value })}
              />
              <input
                class="col-span-4 rounded border border-stroke px-2 py-1 text-xs"
                placeholder="Description"
                value={line.item_name}
                onInput={(e) => updateLine(index(), { item_name: e.currentTarget.value })}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                class="col-span-2 rounded border border-stroke px-2 py-1 text-xs"
                placeholder="Qty"
                value={line.qty}
                onInput={(e) => updateLine(index(), { qty: Number(e.currentTarget.value) || 0 })}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                class="col-span-3 rounded border border-stroke px-2 py-1 text-xs"
                placeholder="Unit price"
                value={line.unit_price}
                onInput={(e) => updateLine(index(), { unit_price: Number(e.currentTarget.value) || 0 })}
              />
              <button
                type="button"
                class="col-span-1 text-xs text-red-600 hover:underline disabled:opacity-30"
                disabled={lines().length <= 1}
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index()))}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
      <Show when={lineTotal(lines()) > 0}>
        <p class="mt-2 text-xs text-text-secondary">Line total: {formatPeso(lineTotal(lines()))}</p>
      </Show>
    </div>
  );

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Recurring Invoices</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Subscription-style schedules with line items. Generate a sales invoice when the next run is due.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showInactive()} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
            Show inactive
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={runningDue()}
            onClick={() => void runDueNow()}
          >
            {runningDue() ? "Running…" : "Run due now"}
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            New Recurring Invoice
          </button>
        </div>
      </div>

      <Show when={lastGenerated()}>
        <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Last generated:{" "}
          <A href="/app/sales/sales" class="font-medium underline">
            {lastGenerated()!.sales_no}
          </A>
          <button type="button" class="ml-3 text-xs underline opacity-80" onClick={() => setLastGenerated(null)}>
            Dismiss
          </button>
        </div>
      </Show>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={list.isError}>
          <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <table class="min-w-full overflow-hidden rounded-lg border border-stroke text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Name</th>
              <th class="px-3 py-2 text-left">Customer</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-left">Frequency</th>
              <th class="px-3 py-2 text-left">Next run</th>
              <th class="px-3 py-2 text-left">End date</th>
              <th class="px-3 py-2 text-left">Active</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []} fallback={<tr><td class="px-3 py-6 text-center text-text-secondary" colSpan={8}>No recurring invoices yet.</td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2 font-medium">{row.name}</td>
                  <td class="px-3 py-2">{row.customer_name || "—"}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.amount)}</td>
                  <td class="px-3 py-2 capitalize">{row.frequency}</td>
                  <td class="px-3 py-2">{row.next_run_date}</td>
                  <td class="px-3 py-2">{row.end_date || "—"}</td>
                  <td class="px-3 py-2">{row.is_active ? "Yes" : "No"}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="text-text-secondary hover:underline" onClick={() => void openEdit(row)}>
                        Edit
                      </button>
                      <Show when={row.is_active}>
                        <button
                          type="button"
                          class="text-text-secondary hover:underline"
                          onClick={() => setPreviewRow(row)}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline disabled:opacity-50"
                          disabled={busyId() === row.id}
                          onClick={() => void generate(row)}
                        >
                          {busyId() === row.id ? "…" : "Generate"}
                        </button>
                      </Show>
                      <Show when={row.last_sales_id}>
                        <A href="/app/sales/sales" class="text-text-secondary hover:underline">
                          Open sales list
                        </A>
                      </Show>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={createOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New Recurring Invoice</h2>
              <button type="button" class={modalDismissClass} onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Schedule name</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Monthly support retainer" />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Customer partner</span>
              <div class="mt-1 flex gap-2">
                <input
                  class="w-full rounded border border-stroke px-2 py-1.5"
                  readOnly
                  value={customerName() || (partnerId() ? `Partner #${partnerId()}` : "")}
                  placeholder="Select customer…"
                />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setPartnerPickerOpen(true)}>
                  Find…
                </button>
              </div>
            </label>
            {formLinesEditor()}
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Fallback amount (if no lines)</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Line description (RECUR fallback)</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Frequency</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={frequency()} onChange={(e) => setFrequency(e.currentTarget.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Next run date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={nextRun()} onInput={(e) => setNextRun(e.currentTarget.value)} />
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">End date (optional)</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={endDate()} onInput={(e) => setEndDate(e.currentTarget.value)} />
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void create()}>
              {saving() ? "Saving…" : "Create schedule"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={editOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Edit {editOpen()!.name}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setEditOpen(null)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Schedule name</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
            {formLinesEditor()}
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Fallback amount</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Frequency</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={frequency()} onChange={(e) => setFrequency(e.currentTarget.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Next run date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={nextRun()} onInput={(e) => setNextRun(e.currentTarget.value)} />
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">End date (optional)</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={endDate()} onInput={(e) => setEndDate(e.currentTarget.value)} />
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void saveEdit()}>
              {saving() ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={previewRow()}>
        {(row) => (
          <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
            <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Preview next invoice</h2>
                <button type="button" class={modalDismissClass} onClick={() => setPreviewRow(null)}>Close</button>
              </div>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between"><dt class="text-text-secondary">Schedule</dt><dd class="font-medium">{row().name}</dd></div>
                <div class="flex justify-between"><dt class="text-text-secondary">Customer</dt><dd>{row().customer_name || "—"}</dd></div>
                <div class="flex justify-between"><dt class="text-text-secondary">Invoice date</dt><dd>{row().next_run_date}</dd></div>
                <div class="flex justify-between"><dt class="text-text-secondary">End date</dt><dd>{row().end_date || "—"}</dd></div>
                <div class="flex justify-between"><dt class="text-text-secondary">Amount</dt><dd class="font-semibold">{formatPeso(row().amount)}</dd></div>
                <div class="flex justify-between"><dt class="text-text-secondary">Frequency</dt><dd class="capitalize">{row().frequency}</dd></div>
              </dl>
              <div class="mt-5 flex gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={busyId() === row().id}
                  onClick={() => { setPreviewRow(null); void generate(row()); }}
                >
                  Generate now
                </button>
                <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setPreviewRow(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      <PartnerSearchModal open={partnerPickerOpen()} onClose={() => setPartnerPickerOpen(false)} onSelect={pickPartner} />
    </div>
  );
}
