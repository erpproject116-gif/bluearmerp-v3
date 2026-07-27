import { Modal } from "../../../shared/Modal";
import { formatPeso } from "../../../shared/money";

type Props = {
  open: boolean;
  invoiceNo: string;
  amount: number;
  onCashPayment: () => void;
  onAccounting: () => void;
  onDone: () => void;
};

export function SupplierInvoicePostSaveDialog(props: Props) {
  return (
    <Modal open={props.open} title="Purchase saved" onClose={props.onDone} stacked>
      <p class="text-sm text-text-secondary">
        <strong>{props.invoiceNo}</strong> saved — {formatPeso(props.amount)}. Next step on the MyPage Flow Chart is{" "}
        <strong>Pay</strong> (Cash Out to vendor) — same as Ecount after Purchases.
      </p>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onDone}>
          Done
        </button>
        <a
          href="/app/dashboard"
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
          onClick={props.onDone}
        >
          MyPage Flow Chart
        </a>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-brand-600" onClick={props.onAccounting}>
          Link accounting voucher
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          onClick={props.onCashPayment}
        >
          Cash Payment (to vendor)
        </button>
      </div>
    </Modal>
  );
}
