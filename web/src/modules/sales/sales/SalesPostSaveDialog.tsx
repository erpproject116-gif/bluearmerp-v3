import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { Modal } from "../../../shared/Modal";
import { formatPeso } from "../../../shared/money";
import type { InvoiceAutoSaveResult } from "../../../shared/invoiceApi";

type Props = {
  open: boolean;
  salesId: number;
  salesNo: string;
  amount: number;
  hasSerials?: boolean;
  accounting?: InvoiceAutoSaveResult | null;
  onCashIn: () => void;
  onAccounting: () => void;
  onDone: () => void;
};

export function SalesPostSaveDialog(props: Props) {
  const acct = () => props.accounting;
  const booksReady = () => {
    const s = acct()?.status;
    return s === "posted" || s === "draft" || s === "already";
  };
  const receivablesHref = () =>
    `/app/finance/receivables?q=${encodeURIComponent(props.salesNo || "")}`;
  const jeHref = () => {
    const id = acct()?.journal_entry_id;
    return id
      ? `/app/finance/acct-i/journal-entries?highlight=${id}`
      : "/app/finance/acct-i/journal-entries";
  };

  return (
    <Modal open={props.open} title="Sale saved" onClose={props.onDone} stacked>
      <p class="text-sm text-text-secondary">
        <strong>{props.salesNo}</strong> saved — {formatPeso(props.amount)}.
      </p>

      <Show when={acct()}>
        <p
          class={`mt-2 rounded-md border px-3 py-2 text-sm ${
            booksReady()
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <span class="font-medium">Accounting: </span>
          {acct()!.message}
          <Show when={acct()?.journal_entry_no}>
            {" "}
            (
            <A href={jeHref()} class="font-medium underline" onClick={props.onDone}>
              {acct()!.journal_entry_no}
            </A>
            )
          </Show>
        </p>
      </Show>

      <p class="mt-3 text-sm text-text-secondary">
        Stock on Find Stock updates when line items track inventory. Collect payment next via Cash In or the
        receivable payment worklist.
      </p>

      <Show when={props.hasSerials}>
        <p class="mt-2 text-sm text-text-secondary">
          Sold serials: unit history and coverage are under Serials / Customer Warranty.
        </p>
      </Show>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onDone}>
          Done
        </button>
        <A
          href="/app/inventory/find-stock"
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
          onClick={props.onDone}
        >
          Find Stock
        </A>
        <A
          href={receivablesHref()}
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
          onClick={props.onDone}
        >
          New Receivable Payment
        </A>
        <Show when={props.hasSerials}>
          <A
            href="/app/inventory/serial-lot/registry"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
            onClick={props.onDone}
          >
            Open Serials
          </A>
        </Show>
        <Show when={acct()?.journal_entry_id}>
          <A
            href={jeHref()}
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
            onClick={props.onDone}
          >
            Open journal entry
          </A>
        </Show>
        <Show when={!booksReady()}>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-brand-600"
            onClick={props.onAccounting}
          >
            Link accounting voucher
          </button>
        </Show>
        <Show when={booksReady() && acct()?.status === "draft"}>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-brand-600"
            onClick={props.onAccounting}
          >
            Open Invoice tab
          </button>
        </Show>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          onClick={props.onCashIn}
        >
          Cash In (from customer)
        </button>
      </div>
    </Modal>
  );
}
