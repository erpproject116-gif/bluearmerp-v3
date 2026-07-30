import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { handleSaveResult } from "../../../shared/handleSaveResult";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { SalesInvoicePickerModal } from "../../../shared/SalesInvoicePickerModal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import type { SalesRow } from "../../../shared/useSalesList";
import {
  PartnerSearchModal,
  type PartnerSearchRow,
} from "../../purchase-request/purchase-request/PartnerSearchModal";

type Retainer = {
  id: number;
  retainer_date: string;
  retainer_no: string;
  partner_id?: number | null;
  customer_name: string;
  amount_total: number;
  remaining_amount: number;
  status: string;
  notes: string;
  official_receipt_id?: number | null;
};

export default function RetainerInvoicesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [status, setStatus] = createSignal("");
  const [createOpen, setCreateOpen] = createSignal(false);
  const [applyOpen, setApplyOpen] = createSignal<Retainer | null>(null);
  const [fundOpen, setFundOpen] = createSignal<Retainer | null>(null);
  const [linkReceiptId, setLinkReceiptId] = createSignal("");
  const [historyOpen, setHistoryOpen] = createSignal<Retainer | null>(null);
  const [historyRows, setHistoryRows] = createSignal<
    { id: number; sales_id: number; sales_no: string; applied_amount: number; created_at: string }[]
  >([]);
  const [partnerPickerOpen, setPartnerPickerOpen] = createSignal(false);
  const [salesPickerOpen, setSalesPickerOpen] = createSignal(false);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerName, setCustomerName] = createSignal("");
  const [amount, setAmount] = createSignal("0");
  const [notes, setNotes] = createSignal("");
  const [retainerDate, setRetainerDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [salesId, setSalesId] = createSignal<number | null>(null);
  const [salesLabel, setSalesLabel] = createSignal("");
  const [applyAmount, setApplyAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const isFunded = (row: Retainer) => !!(row.official_receipt_id && row.official_receipt_id > 0);

  const list = createQuery(() => ({
    queryKey: ["retainer-invoices", status()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status()) qs.set("status", status());
      const res = await apiFetch<Retainer[]>(`/api/v1/finance/retainer-invoices?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load retainer invoices");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["retainer-invoices"] });

  const pickPartner = (row: PartnerSearchRow) => {
    setPartnerId(row.id);
    setCustomerName(row.company_name);
  };

  const pickSales = (row: SalesRow) => {
    setSalesId(row.id);
    setSalesLabel(`${row.sales_no} · ${row.customer_name} · ${formatPeso(row.grand_total)}`);
  };

  const create = async () => {
    const amt = Number(amount());
    if (!customerName().trim()) {
      toast.warning("Select or enter a customer.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning("Enter a valid down-payment amount.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/finance/retainer-invoices", {
      method: "POST",
      body: JSON.stringify({
        retainer_date: retainerDate(),
        customer_name: customerName().trim(),
        partner_id: partnerId(),
        amount_total: amt,
        notes: notes().trim(),
        status: "open",
      }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Retainer invoice created.")) return;
    setCreateOpen(false);
    setCustomerName("");
    setPartnerId(null);
    setAmount("0");
    setNotes("");
    invalidate();
  };

  const post = async (row: Retainer) => {
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/retainer-invoices/${row.id}/post`, { method: "POST" });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Retainer opened.")) return;
    invalidate();
  };

  const recordPayment = async () => {
    const row = fundOpen();
    if (!row) return;
    if (!row.partner_id) {
      toast.warning("Link a customer partner before recording payment.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<{ official_receipt_id: number; receipt_no: string }>(
      `/api/v1/finance/retainer-invoices/${row.id}/record-payment`,
      { method: "POST", body: JSON.stringify({ payment_method: "cash" }) },
    );
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast);
      return;
    }
    toast.success(`Official receipt ${res.data.receipt_no} created.`);
    setFundOpen(null);
    invalidate();
  };

  const linkReceipt = async () => {
    const row = fundOpen();
    if (!row) return;
    const rid = Number(linkReceiptId());
    if (!Number.isFinite(rid) || rid <= 0) {
      toast.warning("Enter a valid official receipt ID.");
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/api/v1/finance/retainer-invoices/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ official_receipt_id: rid }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Official receipt linked.")) return;
    setFundOpen(null);
    setLinkReceiptId("");
    invalidate();
  };

  const cancelRetainer = async (row: Retainer) => {
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/retainer-invoices/${row.id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Retainer cancelled.")) return;
    invalidate();
  };

  const openHistory = async (row: Retainer) => {
    setHistoryOpen(row);
    const res = await apiFetch<
      { id: number; sales_id: number; sales_no: string; applied_amount: number; created_at: string }[]
    >(`/api/v1/finance/retainer-invoices/${row.id}/applications`);
    if (!res.success) {
      handleSaveResult(res, toast);
      setHistoryRows([]);
      return;
    }
    setHistoryRows(res.data ?? []);
  };

  const apply = async () => {
    const row = applyOpen();
    if (!row) return;
    const sid = salesId();
    const amt = Number(applyAmount() || row.remaining_amount);
    if (!sid || !Number.isFinite(amt) || amt <= 0) {
      toast.warning("Select a sales invoice and amount.");
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/api/v1/finance/retainer-invoices/${row.id}/apply`, {
      method: "POST",
      body: JSON.stringify({ sales_id: sid, applied_amount: amt }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Down payment applied to sales invoice.")) return;
    setApplyOpen(null);
    setSalesId(null);
    setSalesLabel("");
    setApplyAmount("");
    invalidate();
  };

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Retainer Invoices</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Collect down payments before the full invoice. Fund via official receipt, then apply to a sales invoice.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <select
            class="rounded border border-stroke px-2 py-1.5 text-sm"
            value={status()}
            onChange={(e) => setStatus(e.currentTarget.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="applied">Applied</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => setCreateOpen(true)}
          >
            New Retainer
          </button>
        </div>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={list.isError}>
          <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <table class="min-w-full overflow-hidden rounded-lg border border-stroke text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Customer</th>
              <th class="px-3 py-2 text-right">Total</th>
              <th class="px-3 py-2 text-right">Remaining</th>
              <th class="px-3 py-2 text-left">Funded</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []} fallback={<tr><td class="px-3 py-6 text-center text-text-secondary" colSpan={8}>No retainer invoices yet.</td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.retainer_no}</td>
                  <td class="px-3 py-2">{row.retainer_date}</td>
                  <td class="px-3 py-2">{row.customer_name || "—"}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.amount_total)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.remaining_amount)}</td>
                  <td class="px-3 py-2">
                    <Show when={isFunded(row)} fallback={<span class="text-amber-700">Unfunded</span>}>
                      <span class="text-emerald-700">OR #{row.official_receipt_id}</span>
                    </Show>
                  </td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-2">
                      <Show when={row.status === "draft"}>
                        <button type="button" class="text-brand-600 hover:underline disabled:opacity-50" disabled={busyId() === row.id} onClick={() => void post(row)}>
                          Open
                        </button>
                      </Show>
                      <Show when={(row.status === "draft" || row.status === "open") && !isFunded(row)}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline"
                          onClick={() => {
                            setFundOpen(row);
                            setLinkReceiptId("");
                          }}
                        >
                          Fund (OR)
                        </button>
                      </Show>
                      <Show when={row.status === "draft" || (row.status === "open" && row.remaining_amount === row.amount_total)}>
                        <button type="button" class="text-red-600 hover:underline disabled:opacity-50" disabled={busyId() === row.id} onClick={() => void cancelRetainer(row)}>
                          Cancel
                        </button>
                      </Show>
                      <button type="button" class="text-brand-600 hover:underline" onClick={() => void openHistory(row)}>
                        History
                      </button>
                      <Show when={(row.status === "open" || row.status === "applied") && row.remaining_amount > 0}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!isFunded(row)}
                          title={isFunded(row) ? undefined : "Fund via official receipt before applying"}
                          onClick={() => {
                            if (!isFunded(row)) {
                              toast.warning("Retainer must be funded via OR before applying.");
                              return;
                            }
                            setApplyOpen(row);
                            setApplyAmount(String(row.remaining_amount));
                            setSalesId(null);
                            setSalesLabel("");
                          }}
                        >
                          Apply to invoice
                        </button>
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
              <h2 class="text-lg font-semibold">New Retainer Invoice</h2>
              <button type="button" class={modalDismissClass} onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={retainerDate()} onInput={(e) => setRetainerDate(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Customer</span>
              <div class="mt-1 flex gap-2">
                <input
                  class="w-full rounded border border-stroke px-2 py-1.5"
                  value={customerName()}
                  onInput={(e) => setCustomerName(e.currentTarget.value)}
                  placeholder="Customer name"
                />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setPartnerPickerOpen(true)}>
                  Find…
                </button>
              </div>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Down payment amount</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Notes</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Project / order reference" />
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void create()}>
              {saving() ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={fundOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Fund {fundOpen()!.retainer_no}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setFundOpen(null)}>Close</button>
            </div>
            <p class="mb-4 text-sm text-text-secondary">
              Amount: {formatPeso(fundOpen()!.amount_total)} · {fundOpen()!.customer_name || "—"}
            </p>
            <div class="space-y-4">
              <div>
                <button
                  type="button"
                  class="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={saving() || !fundOpen()?.partner_id}
                  onClick={() => void recordPayment()}
                >
                  {saving() ? "Recording…" : "Record payment (create OR)"}
                </button>
                <Show when={!fundOpen()?.partner_id}>
                  <p class="mt-1 text-xs text-amber-700">Link a customer partner on this retainer first.</p>
                </Show>
              </div>
              <div class="border-t border-stroke pt-4">
                <p class="mb-2 text-xs text-text-secondary">Or link an existing official receipt ID:</p>
                <div class="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    class="w-full rounded border border-stroke px-2 py-1.5 text-sm"
                    value={linkReceiptId()}
                    onInput={(e) => setLinkReceiptId(e.currentTarget.value)}
                    placeholder="OR id"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                    disabled={saving()}
                    onClick={() => void linkReceipt()}
                  >
                    Link
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={applyOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Apply {applyOpen()!.retainer_no}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setApplyOpen(null)}>Close</button>
            </div>
            <p class="mb-3 text-sm text-text-secondary">Remaining: {formatPeso(applyOpen()!.remaining_amount)}</p>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Sales invoice</span>
              <div class="mt-1 flex gap-2">
                <input
                  class="w-full rounded border border-stroke px-2 py-1.5"
                  readOnly
                  value={salesLabel() || (salesId() ? `Sales #${salesId()}` : "")}
                  placeholder="Select an invoice…"
                />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setSalesPickerOpen(true)}>
                  Find…
                </button>
              </div>
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Amount to apply</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={applyAmount()} onInput={(e) => setApplyAmount(e.currentTarget.value)} />
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void apply()}>
              {saving() ? "Applying…" : "Apply down payment"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={historyOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Applications · {historyOpen()!.retainer_no}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setHistoryOpen(null)}>Close</button>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-stroke text-left text-text-secondary">
                  <th class="py-2">Sales</th>
                  <th class="py-2 text-right">Amount</th>
                  <th class="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                <For each={historyRows()} fallback={<tr><td class="py-4 text-text-secondary" colSpan={3}>No applications yet.</td></tr>}>
                  {(app) => (
                    <tr class="border-t border-stroke/60">
                      <td class="py-2">{app.sales_no}</td>
                      <td class="py-2 text-right">{formatPeso(app.applied_amount)}</td>
                      <td class="py-2 text-text-secondary">{app.created_at.slice(0, 10)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <PartnerSearchModal open={partnerPickerOpen()} onClose={() => setPartnerPickerOpen(false)} onSelect={pickPartner} />
      <SalesInvoicePickerModal
        open={salesPickerOpen()}
        onClose={() => setSalesPickerOpen(false)}
        onSelect={pickSales}
        initialQ={applyOpen()?.customer_name ?? ""}
        partnerId={applyOpen()?.partner_id}
      />
    </div>
  );
}
