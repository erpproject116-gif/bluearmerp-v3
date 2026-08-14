import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
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
import { openCreditNotePrint } from "./creditNotePrint";

type CreditNote = {
  id: number;
  credit_date: string;
  credit_no: string;
  partner_id?: number | null;
  customer_name: string;
  amount_total: number;
  remaining_amount: number;
  status: string;
  reason: string;
  notes: string;
  refund_method?: string | null;
  journal_entry_id?: number | null;
};

export default function CreditNotesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [status, setStatus] = createSignal("");
  const [createOpen, setCreateOpen] = createSignal(false);
  const [applyOpen, setApplyOpen] = createSignal<CreditNote | null>(null);
  const [refundOpen, setRefundOpen] = createSignal<CreditNote | null>(null);
  const [partnerPickerOpen, setPartnerPickerOpen] = createSignal(false);
  const [salesPickerOpen, setSalesPickerOpen] = createSignal(false);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerName, setCustomerName] = createSignal("");
  const [amount, setAmount] = createSignal("0");
  const [reason, setReason] = createSignal("");
  const [creditDate, setCreditDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [salesId, setSalesId] = createSignal<number | null>(null);
  const [salesLabel, setSalesLabel] = createSignal("");
  const [applyAmount, setApplyAmount] = createSignal("");
  const [refundMethod, setRefundMethod] = createSignal("cash");
  const [refundRef, setRefundRef] = createSignal("");
  const [sourceSalesId, setSourceSalesId] = createSignal<number | null>(null);
  const [sourceSalesLabel, setSourceSalesLabel] = createSignal("");
  const [sourcePickerOpen, setSourcePickerOpen] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal<CreditNote | null>(null);
  const [historyRows, setHistoryRows] = createSignal<
    { id: number; sales_id: number; sales_no: string; applied_amount: number; created_at: string }[]
  >([]);
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["credit-notes", status()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status()) qs.set("status", status());
      const res = await apiFetch<CreditNote[]>(`/api/v1/finance/credit-notes?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load credit notes");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["credit-notes"] });

  const pickPartner = (row: PartnerSearchRow) => {
    setPartnerId(row.id);
    setCustomerName(row.company_name);
  };

  const pickSales = (row: SalesRow) => {
    setSalesId(row.id);
    setSalesLabel(`${row.sales_no} · ${row.customer_name} · ${formatPeso(row.grand_total)}`);
  };

  const pickSourceSales = (row: SalesRow) => {
    setSourceSalesId(row.id);
    setSourceSalesLabel(`${row.sales_no} · ${row.customer_name}`);
    if (!partnerId() && row.partner_id) setPartnerId(row.partner_id);
    if (!customerName().trim() && row.customer_name) setCustomerName(row.customer_name);
  };

  const create = async () => {
    const amt = Number(amount());
    if (!customerName().trim()) {
      toast.warning("Select or enter a customer.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning("Enter a valid amount.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/finance/credit-notes", {
      method: "POST",
      body: JSON.stringify({
        credit_date: creditDate(),
        customer_name: customerName().trim(),
        partner_id: partnerId(),
        source_sales_id: sourceSalesId(),
        amount_total: amt,
        reason: reason().trim(),
        status: "open",
      }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Credit note created.")) return;
    setCreateOpen(false);
    setCustomerName("");
    setPartnerId(null);
    setSourceSalesId(null);
    setSourceSalesLabel("");
    setAmount("0");
    setReason("");
    invalidate();
  };

  const cancelNote = async (row: CreditNote) => {
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/credit-notes/${row.id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Credit note cancelled.")) return;
    invalidate();
  };

  const openHistory = async (row: CreditNote) => {
    setHistoryOpen(row);
    const res = await apiFetch<
      { id: number; sales_id: number; sales_no: string; applied_amount: number; created_at: string }[]
    >(`/api/v1/finance/credit-notes/${row.id}/applications`);
    if (!res.success) {
      handleSaveResult(res, toast);
      setHistoryRows([]);
      return;
    }
    setHistoryRows(res.data ?? []);
  };

  const post = async (row: CreditNote) => {
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/credit-notes/${row.id}/post`, { method: "POST" });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Credit note opened.")) return;
    invalidate();
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
    const res = await apiFetch(`/api/v1/finance/credit-notes/${row.id}/apply`, {
      method: "POST",
      body: JSON.stringify({ sales_id: sid, applied_amount: amt }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Credit applied to sales invoice.")) return;
    setApplyOpen(null);
    setSalesId(null);
    setSalesLabel("");
    setApplyAmount("");
    invalidate();
  };

  const convertToCash = async () => {
    const row = refundOpen();
    if (!row) return;
    setSaving(true);
    const res = await apiFetch<{ expense_id?: number; expense_no?: string; payment_voucher_id?: number; payment_no?: string; amount: number }>(
      `/api/v1/finance/credit-notes/${row.id}/convert-to-cash`,
      {
        method: "POST",
        body: JSON.stringify({
          refund_method: refundMethod(),
          refund_reference: refundRef().trim(),
        }),
      },
    );
    setSaving(false);
    if (!res.success) {
      handleSaveResult(res, toast);
      return;
    }
    const pvNo = res.data?.payment_no;
    const expNo = res.data?.expense_no ?? "";
    toast.success(pvNo ? `Refund recorded as payment voucher ${pvNo}.` : `Refund recorded as expense ${expNo}. View under Expenses.`);
    setRefundOpen(null);
    invalidate();
  };

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Credit Notes</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Excess payment notes for future invoices. Apply to a sales invoice, or convert remaining balance to cash.
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
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => setCreateOpen(true)}
          >
            New Credit Note
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
              <th class="px-3 py-2 text-left">Reason</th>
              <th class="px-3 py-2 text-right">Total</th>
              <th class="px-3 py-2 text-right">Remaining</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">JE</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []} fallback={<tr><td class="px-3 py-6 text-center text-text-secondary" colSpan={9}>No credit notes yet.</td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.credit_no}</td>
                  <td class="px-3 py-2">{row.credit_date}</td>
                  <td class="px-3 py-2">{row.customer_name || "—"}</td>
                  <td class="px-3 py-2">{row.reason || "—"}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.amount_total)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.remaining_amount)}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">
                    <Show when={row.journal_entry_id} fallback={<span class="text-text-secondary">—</span>}>
                      <A href="/app/finance/acct-i/journal-entries" class="text-brand-600 hover:underline">
                        #{row.journal_entry_id}
                      </A>
                    </Show>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="text-brand-600 hover:underline" onClick={() => openCreditNotePrint(row.id)}>
                        Print
                      </button>
                      <Show when={row.status === "draft"}>
                        <button type="button" class="text-brand-600 hover:underline disabled:opacity-50" disabled={busyId() === row.id} onClick={() => void post(row)}>
                          Open
                        </button>
                      </Show>
                      <Show when={row.status === "draft" || (row.status === "open" && row.remaining_amount === row.amount_total)}>
                        <button type="button" class="text-red-600 hover:underline disabled:opacity-50" disabled={busyId() === row.id} onClick={() => void cancelNote(row)}>
                          Cancel
                        </button>
                      </Show>
                      <button type="button" class="text-brand-600 hover:underline" onClick={() => void openHistory(row)}>
                        History
                      </button>
                      <Show when={(row.status === "open" || row.status === "applied") && row.remaining_amount > 0}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline"
                          onClick={() => {
                            setApplyOpen(row);
                            setApplyAmount(String(row.remaining_amount));
                            setSalesId(null);
                            setSalesLabel("");
                          }}
                        >
                          Apply
                        </button>
                        <button type="button" class="text-brand-600 hover:underline" onClick={() => setRefundOpen(row)}>
                          Convert to cash
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
              <h2 class="text-lg font-semibold">New Credit Note</h2>
              <button type="button" class={modalDismissClass} onClick={() => setCreateOpen(false)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={creditDate()} onInput={(e) => setCreditDate(e.currentTarget.value)} />
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
              <span class="text-text-secondary">Amount</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Source sales invoice (optional)</span>
              <div class="mt-1 flex gap-2">
                <input
                  class="w-full rounded border border-stroke px-2 py-1.5"
                  readOnly
                  value={sourceSalesLabel() || (sourceSalesId() ? `Sales #${sourceSalesId()}` : "")}
                  placeholder="Link originating invoice…"
                />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setSourcePickerOpen(true)}>
                  Find…
                </button>
              </div>
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Reason</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={reason()} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Overpayment, return adjustment…" />
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void create()}>
              {saving() ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={applyOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Apply {applyOpen()!.credit_no}</h2>
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
              {saving() ? "Applying…" : "Apply to invoice"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={refundOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Convert to cash</h2>
              <button type="button" class={modalDismissClass} onClick={() => setRefundOpen(null)}>Close</button>
            </div>
            <p class="mb-3 text-sm text-text-secondary">
              Refund remaining {formatPeso(refundOpen()!.remaining_amount)} for {refundOpen()!.credit_no}.
            </p>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Method</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={refundMethod()} onChange={(e) => setRefundMethod(e.currentTarget.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="check">Check</option>
                <option value="gcash">GCash / e-wallet</option>
              </select>
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Reference (optional)</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={refundRef()} onInput={(e) => setRefundRef(e.currentTarget.value)} />
            </label>
            <p class="mb-4 text-xs text-text-secondary">
              Creates a payment voucher when the customer is linked to a partner; otherwise falls back to an expense record.
            </p>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void convertToCash()}>
              {saving() ? "Processing…" : "Convert to cash"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={historyOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Applications · {historyOpen()!.credit_no}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setHistoryOpen(null)}>Close</button>
            </div>
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-left text-text-secondary">
                  <th class="py-1">Sales</th>
                  <th class="py-1 text-right">Amount</th>
                  <th class="py-1">When</th>
                </tr>
              </thead>
              <tbody>
                <For each={historyRows()} fallback={<tr><td class="py-4 text-text-secondary" colSpan={3}>No applications yet.</td></tr>}>
                  {(h) => (
                    <tr class="border-t border-stroke/60">
                      <td class="py-1.5">{h.sales_no}</td>
                      <td class="py-1.5 text-right">{formatPeso(h.applied_amount)}</td>
                      <td class="py-1.5">{h.created_at?.slice(0, 19) ?? "—"}</td>
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
      <SalesInvoicePickerModal
        open={sourcePickerOpen()}
        onClose={() => setSourcePickerOpen(false)}
        onSelect={pickSourceSales}
        initialQ={customerName()}
        partnerId={partnerId() ?? undefined}
      />
    </div>
  );
}
