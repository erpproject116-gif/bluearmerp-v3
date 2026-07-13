import { Modal } from "../../../shared/Modal";
import { formatPeso } from "../../../shared/money";

type Props = {
  open: boolean;
  salesNo: string;
  amount: number;
  onCashIn: () => void;
  onAccounting: () => void;
  onDone: () => void;
};

export function SalesPostSaveDialog(props: Props) {
  return (
    <Modal open={props.open} title="Sale saved" onClose={props.onDone} stacked>
      <p class="text-sm text-text-secondary">
        <strong>{props.salesNo}</strong> saved — {formatPeso(props.amount)}. Record payment or set up the accounting invoice now?
      </p>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onDone}>
          Done
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-brand-600" onClick={props.onAccounting}>
          Link accounting voucher
        </button>
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
