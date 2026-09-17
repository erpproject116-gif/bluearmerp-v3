import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { formatPeso } from "../../../shared/money";
import { DecimalInput } from "../../../shared/DecimalInput";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { PaymentApplyJournalModal, type ApplyAppLine } from "./PaymentApplyJournalModal";

export type OpenBalanceRow = {
  doc_type?: string;
  sales_id?: number;
  supplier_invoice_id?: number;
  expense_id?: number;
  sales_no?: string;
  invoice_no?: string;
  date_no_display: string;
  occurrence_date: string;
  due_date?: string | null;
  balance: number;
  partner_id: number;
  partner_code: string;
  partner_name: string;
  currency_id?: number;
  currency_code?: string;
  account_name: string;
  location_name?: string;
  project_name?: string | null;
  department_name?: string | null;
  remark?: string;
};

type TxnRow = {
  txn_type: string;
  doc_no: string;
  doc_date: string;
  applied_amount: number;
  ref_id: number;
};

type Props = { side: "ar" | "ap" };

function rowKey(r: OpenBalanceRow) {
  if (r.doc_type === "expense" || (r.expense_id ?? 0) > 0) {
    return `expense:${r.expense_id ?? 0}`;
  }
  if ((r.sales_id ?? 0) > 0) {
    return `sales:${r.sales_id}`;
  }
  return `si:${r.supplier_invoice_id ?? 0}`;
}
function docId(r: OpenBalanceRow) {
  return r.sales_id ?? r.expense_id ?? r.supplier_invoice_id ?? 0;
}
function docNo(r: OpenBalanceRow) {
  return r.date_no_display || r.sales_no || r.invoice_no || String(docId(r));
}

export function OpenBalancePaymentPage(props: Props) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = () => {
    const raw = searchParams.q;
    return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
  };
  const [q, setQ] = createSignal(initialQ());
  const [dueFrom, setDueFrom] = createSignal("");
  const [dueTo, setDueTo] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Record<string, boolean>>({});
  const [decrease, setDecrease] = createSignal<Record<string, string>>({});
  const [discount, setDiscount] = createSignal<Record<string, string>>({});
  const [journalOpen, setJournalOpen] = createSignal(false);
  const [allowMulti, setAllowMulti] = createSignal(false);
  const [txnTarget, setTxnTarget] = createSignal<OpenBalanceRow | null>(null);
  const pageSize = 50;

  createEffect(() => {
    const next = initialQ();
    if (next && next !== q()) {
      setQ(next);
      setPage(1);
    }
  });

  const setSearchQ = (value: string) => {
    setQ(value);
    setPage(1);
    const next = { ...searchParams } as Record<string, string | undefined>;
    if (value.trim()) next.q = value.trim();
    else delete next.q;
    setSearchParams(next, { replace: true });
  };

  const list = createQuery(() => ({
    queryKey: ["open-payments", props.side, q(), dueFrom(), dueTo(), page()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize),
        sort: "occurrence_date",
        order: "desc",
      });
      if (q().trim()) qs.set("q", q().trim());
      if (dueFrom()) qs.set("due_from", dueFrom());
      if (dueTo()) qs.set("due_to", dueTo());
      const path =
        props.side === "ar"
          ? `/api/v1/finance/receivables/open?${qs}`
          : `/api/v1/finance/payables/open?${qs}`;
      const res = await apiFetch<OpenBalanceRow[]>(path);
      if (!res.success) throw new Error(res.message ?? "Failed to load open balances");
      return { rows: res.data ?? [], total: res.meta?.total ?? res.data?.length ?? 0 };
    },
  }));

  const rows = createMemo(() => list.data?.rows ?? []);
  const hasFilters = createMemo(() => Boolean(q().trim() || dueFrom() || dueTo()));
  const clearFilters = () => {
    setSearchQ("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
  };
  const totalPages = createMemo(() => Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize)));
  const pageBalanceTotal = createMemo(() =>
    rows().reduce((sum, r) => sum + (Number(r.balance) || 0), 0),
  );

  const selectedRows = createMemo(() => rows().filter((r) => selected()[rowKey(r)]));

  const partnerIds = createMemo(() => {
    const ids = new Set(selectedRows().map((r) => r.partner_id));
    return [...ids];
  });

  const applyLines = createMemo((): ApplyAppLine[] => {
    const lines: ApplyAppLine[] = [];
    for (const r of selectedRows()) {
      const key = rowKey(r);
      const amt = Number(decrease()[key] ?? "");
      const disc = Number(discount()[key] ?? "") || 0;
      if (!(amt > 0) && !(disc > 0)) continue;
      const isExpense = r.doc_type === "expense" || (r.expense_id ?? 0) > 0;
      lines.push({
        doc_id: docId(r),
        doc_type: isExpense ? "expense" : props.side === "ap" ? "supplier_invoice" : undefined,
        expense_id: isExpense ? r.expense_id ?? docId(r) : undefined,
        supplier_invoice_id: !isExpense && props.side === "ap" ? r.supplier_invoice_id ?? docId(r) : undefined,
        applied_amount: amt > 0 ? amt : 0,
        discount_amount: disc > 0 ? disc : 0,
        label: docNo(r),
      });
    }
    return lines;
  });

  const toggle = (r: OpenBalanceRow, on: boolean) => {
    const key = rowKey(r);
    setSelected((prev) => ({ ...prev, [key]: on }));
    if (on) {
      setDecrease((prev) => ({ ...prev, [key]: prev[key] ?? String(r.balance) }));
    }
  };

  const openJournal = () => {
    if (applyLines().length === 0) {
      toast.warning("Check rows and enter Decrease Amount greater than zero.");
      return;
    }
    if (partnerIds().length > 1 && !allowMulti()) {
      toast.warning("Selected rows must belong to one partner, or enable multi-partner apply.");
      return;
    }
    setJournalOpen(true);
  };

  createEffect(() => {
    // reset selection when filters change
    q();
    dueFrom();
    dueTo();
    page();
    setSelected({});
  });

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-[14rem] flex-1">
          <input
            class={inputClass}
            placeholder="Search partner, payable no., vendor invoice no., or date-no"
            value={q()}
            onInput={(e) => {
              setSearchQ(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void list.refetch();
            }}
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-text-secondary">Due from</label>
          <input
            class={inputClass}
            type="date"
            value={dueFrom()}
            onInput={(e) => {
              setDueFrom(e.currentTarget.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-text-secondary">Due to</label>
          <input
            class={inputClass}
            type="date"
            value={dueTo()}
            onInput={(e) => {
              setDueTo(e.currentTarget.value);
              setPage(1);
            }}
          />
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => void list.refetch()}
        >
          Search (F3)
        </button>
        <Show when={hasFilters()}>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </Show>
        <label class="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={allowMulti()} onChange={(e) => setAllowMulti(e.currentTarget.checked)} />
          Multi-partner bundling
        </label>
      </div>

      <p class="text-xs text-text-secondary">
        Rows are newest first by occurrence date. Open balances only — fully paid purchases do not appear here.
      </p>

      <Show when={list.isError}>
        <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
      </Show>

      <div class="overflow-x-auto rounded border border-stroke">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-2 py-2" />
              <th class="px-2 py-2">{props.side === "ar" ? "Receivable No." : "Payable No."}</th>
              <th class="px-2 py-2 whitespace-nowrap">Occurrence ↓</th>
              <th class="px-2 py-2">Due Date</th>
              <th class="px-2 py-2">Account</th>
              <th class="px-2 py-2">Code</th>
              <th class="px-2 py-2">Customer/Vendor</th>
              <th class="px-2 py-2 text-right">Balance</th>
              <th class="px-2 py-2">FX</th>
              <th class="px-2 py-2 text-right">Decrease Amount</th>
              <th class="px-2 py-2 text-right">Discount Amount</th>
              <th class="px-2 py-2">Remark</th>
              <th class="px-2 py-2">Dept</th>
              <th class="px-2 py-2">Project</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!list.isFetching && rows().length === 0}>
              <tr>
                <td colSpan={14} class="px-3 py-8 text-center text-text-secondary">
                  <Show
                    when={hasFilters()}
                    fallback={
                      props.side === "ar"
                        ? "No open balances. Saved sales with an unpaid balance appear here automatically (except while in E-Approval)."
                        : "No open balances. Saved purchases with an unpaid balance appear here automatically."
                    }
                  >
                    No open balances match these filters.{" "}
                    <button type="button" class="font-medium text-brand-700 underline" onClick={clearFilters}>
                      Clear filters
                    </button>{" "}
                    to see the newest unpaid {props.side === "ar" ? "sales" : "purchases"}.
                  </Show>
                </td>
              </tr>
            </Show>
            <For each={rows()}>
              {(r) => {
                const key = () => rowKey(r);
                return (
                  <tr class={`border-t border-stroke/60 ${selected()[key()] ? "bg-brand-50/60" : ""}`}>
                    <td class="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(selected()[key()])}
                        onChange={(e) => toggle(r, e.currentTarget.checked)}
                      />
                    </td>
                    <td class="px-2 py-1.5">
                      <button
                        type="button"
                        class="text-left text-brand-700 hover:underline"
                        onClick={() => setTxnTarget(r)}
                      >
                        {docNo(r)}
                      </button>
                    </td>
                    <td class="px-2 py-1.5 whitespace-nowrap">{r.occurrence_date}</td>
                    <td class="px-2 py-1.5 whitespace-nowrap">{r.due_date ?? ""}</td>
                    <td class="px-2 py-1.5">{r.account_name}</td>
                    <td class="px-2 py-1.5">{r.partner_code}</td>
                    <td class="px-2 py-1.5">{r.partner_name}</td>
                    <td class="px-2 py-1.5 text-right tabular-nums">{formatPeso(r.balance)}</td>
                    <td class="px-2 py-1.5">{r.currency_code ?? ""}</td>
                    <td class="px-2 py-1.5">
                      <DecimalInput
                        class={`${inputClass} text-right`}
                        value={decrease()[key()] ?? ""}
                        onValue={(v) => setDecrease((prev) => ({ ...prev, [key()]: v }))}
                        disabled={!selected()[key()]}
                      />
                    </td>
                    <td class="px-2 py-1.5">
                      <DecimalInput
                        class={`${inputClass} text-right`}
                        value={discount()[key()] ?? ""}
                        onValue={(v) => setDiscount((prev) => ({ ...prev, [key()]: v }))}
                        disabled={!selected()[key()]}
                      />
                    </td>
                    <td class="px-2 py-1.5 max-w-[10rem] truncate">{r.remark ?? ""}</td>
                    <td class="px-2 py-1.5">{r.department_name ?? ""}</td>
                    <td class="px-2 py-1.5">{r.project_name ?? ""}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
          <Show when={rows().length > 0}>
            <tfoot>
              <tr class="border-t-2 border-brand-200 bg-slate-50 font-semibold text-text-primary">
                <td class="px-2 py-2" colspan={7}>
                  Page total
                </td>
                <td class="px-2 py-2 text-right tabular-nums">{formatPeso(pageBalanceTotal())}</td>
                <td class="px-2 py-2" colspan={6} />
              </tr>
            </tfoot>
          </Show>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={applyLines().length === 0}
          onClick={openJournal}
        >
          {props.side === "ar" ? "Receipts Journal" : "Payments Journal"}
        </button>
        <div class="flex items-center gap-2 text-sm">
          <button
            type="button"
            class="rounded border border-stroke px-2 py-1 disabled:opacity-40"
            disabled={page() <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span>
            {page()} / {totalPages()}
          </span>
          <button
            type="button"
            class="rounded border border-stroke px-2 py-1 disabled:opacity-40"
            disabled={page() >= totalPages()}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <PaymentApplyJournalModal
        open={journalOpen()}
        side={props.side}
        lines={applyLines()}
        partnerLabel={
          partnerIds().length === 1
            ? selectedRows()[0]?.partner_name ?? ""
            : `${partnerIds().length} partners`
        }
        allowMultiPartner={allowMulti()}
        onClose={() => setJournalOpen(false)}
        onApplied={() => {
          setSelected({});
          setDecrease({});
          void list.refetch();
        }}
      />

      <Show when={txnTarget()}>
        {(row) => (
          <TransactionDetailsModal
            side={props.side}
            row={row()}
            onClose={() => setTxnTarget(null)}
          />
        )}
      </Show>
    </div>
  );
}

function TransactionDetailsModal(props: { side: "ar" | "ap"; row: OpenBalanceRow; onClose: () => void }) {
  const detail = createQuery(() => ({
    queryKey: ["open-txn", props.side, rowKey(props.row)],
    queryFn: async () => {
      const id = docId(props.row);
      const isExpense = props.row.doc_type === "expense" || (props.row.expense_id ?? 0) > 0;
      const path =
        props.side === "ar"
          ? `/api/v1/finance/receivables/${id}/transactions`
          : isExpense
            ? `/api/v1/finance/payables/${id}/transactions?doc_type=expense`
            : `/api/v1/finance/payables/${id}/transactions`;
      const res = await apiFetch<TxnRow[]>(path);
      return res.data ?? [];
    },
  }));

  return (
    <Modal open={true} title={`${props.side === "ar" ? "Receivable" : "Payable"} Transaction Details`} onClose={props.onClose} wide stacked>
      <p class="mb-3 text-sm text-text-secondary">
        {docNo(props.row)} · {props.row.partner_name} · Balance {formatPeso(props.row.balance)}
      </p>
      <div class="max-h-96 overflow-y-auto rounded border border-stroke">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-2 py-1 text-left">Type</th>
              <th class="px-2 py-1 text-left">Doc No.</th>
              <th class="px-2 py-1 text-left">Date</th>
              <th class="px-2 py-1 text-right">Applied</th>
            </tr>
          </thead>
          <tbody>
            <Show when={(detail.data ?? []).length === 0 && !detail.isFetching}>
              <tr>
                <td colSpan={4} class="px-2 py-6 text-center text-text-secondary">
                  No applications yet.
                </td>
              </tr>
            </Show>
            <For each={detail.data ?? []}>
              {(t) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-2 py-1">{t.txn_type}</td>
                  <td class="px-2 py-1">{t.doc_no}</td>
                  <td class="px-2 py-1">{t.doc_date}</td>
                  <td class="px-2 py-1 text-right tabular-nums">{formatPeso(t.applied_amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
