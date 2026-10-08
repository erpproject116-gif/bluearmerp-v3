import { Show, createSignal } from "solid-js";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";

type BulkItemPatch = {
  item_name?: string;
  spec_name?: string;
  purchase_price?: number;
  sales_price?: number;
  vip_price?: number;
  warranty_duration_months?: number;
};

type Props = {
  open: boolean;
  count: number;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (patch: BulkItemPatch) => void | Promise<void>;
};

export function BulkItemEditModal(props: Props) {
  const [itemName, setItemName] = createSignal("");
  const [specName, setSpecName] = createSignal("");
  const [purchasePrice, setPurchasePrice] = createSignal("");
  const [salesPrice, setSalesPrice] = createSignal("");
  const [vipPrice, setVipPrice] = createSignal("");
  const [warrantyMonths, setWarrantyMonths] = createSignal("");
  const [warrantyError, setWarrantyError] = createSignal("");

  const reset = () => {
    setItemName("");
    setSpecName("");
    setPurchasePrice("");
    setSalesPrice("");
    setVipPrice("");
    setWarrantyMonths("");
    setWarrantyError("");
  };

  const submit = () => {
    const patch: BulkItemPatch = {};
    if (itemName().trim()) patch.item_name = itemName().trim();
    if (specName().trim()) patch.spec_name = specName().trim();
    if (purchasePrice().trim()) patch.purchase_price = Number(purchasePrice());
    if (salesPrice().trim()) patch.sales_price = Number(salesPrice());
    if (vipPrice().trim()) patch.vip_price = Number(vipPrice());
    const months = warrantyMonths().trim();
    if (months) {
      if (!/^\d+$/.test(months)) {
        setWarrantyError("Enter a whole number of months, or leave blank.");
        return;
      }
      patch.warranty_duration_months = Number(months);
    }
    setWarrantyError("");
    void props.onConfirm(patch);
  };

  return (
    <Modal
      open={props.open}
      title={`Bulk edit ${props.count} item(s)`}
      onClose={() => {
        if (props.submitting) return;
        reset();
        props.onClose();
      }}
      stacked
    >
      <p class="mb-4 text-sm text-text-secondary">
        Leave a field blank to keep the current value on each selected item.
      </p>
      <div class="space-y-3">
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">Name</span>
          <input class={inputClass} value={itemName()} onInput={(e) => setItemName(e.currentTarget.value)} />
        </label>
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">Spec</span>
          <input class={inputClass} value={specName()} onInput={(e) => setSpecName(e.currentTarget.value)} />
        </label>
        <div class="grid grid-cols-3 gap-3">
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">Purchase</span>
            <input type="number" step="any" class={inputClass} value={purchasePrice()} onInput={(e) => setPurchasePrice(e.currentTarget.value)} />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">Sales</span>
            <input type="number" step="any" class={inputClass} value={salesPrice()} onInput={(e) => setSalesPrice(e.currentTarget.value)} />
          </label>
          <label class="block text-sm">
            <span class="mb-1 block text-text-secondary">VIP</span>
            <input type="number" step="any" class={inputClass} value={vipPrice()} onInput={(e) => setVipPrice(e.currentTarget.value)} />
          </label>
        </div>
        <label class="block text-sm">
          <span class="mb-1 block text-text-secondary">Warranty (months)</span>
          <input
            type="text"
            inputMode="numeric"
            class={inputClass}
            value={warrantyMonths()}
            onInput={(e) => {
              setWarrantyMonths(e.currentTarget.value);
              setWarrantyError("");
            }}
          />
          <Show when={warrantyError()}>
            <span class="mt-1 block text-xs text-red-600">{warrantyError()}</span>
          </Show>
        </label>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" disabled={props.submitting} onClick={() => props.onClose()}>
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={props.submitting}
          onClick={submit}
        >
          <Show when={props.submitting} fallback="Apply to selected">
            Saving…
          </Show>
        </button>
      </div>
    </Modal>
  );
}
