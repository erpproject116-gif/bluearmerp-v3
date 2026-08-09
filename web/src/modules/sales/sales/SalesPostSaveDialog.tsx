import { Show } from "solid-js";
import { Modal } from "../../../shared/Modal";
import { formatPeso } from "../../../shared/money";

type Props = {
  open: boolean;
  salesNo: string;
  amount: number;
  hasSerials?: boolean;
  onCashIn: () => void;
  onAccounting: () => void;
  onDone: () => void;
};

export function SalesPostSaveDialog(props: Props) {
  return (
    <Modal open={props.open} title="Sale saved" onClose={props.onDone} stacked>
      <p class="text-sm text-text-secondary">
        <strong>{props.salesNo}</strong> saved — {formatPeso(props.amount)}. Next step on the MyPage Flow Chart is{" "}
        <strong>Receipt</strong> (Cash In) — same as Ecount after Sales.
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
        <Show when={props.hasSerials}>
          <a
            href="/app/inventory/serial-lot/registry"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
            onClick={props.onDone}
          >
            Open Serials
          </a>
          <a
            href="/app/after-sales/warranty"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary"
            onClick={props.onDone}
          >
            Customer Warranty
          </a>
        </Show>
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
          onClick={props.onCashIn}
        >
          Cash In (from customer)
        </button>
      </div>
    </Modal>
  );
}
