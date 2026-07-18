import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { DecimalInput } from "./DecimalInput";
import { apiFetch } from "./api";
import { useToast } from "./toast";

export type CreatedItem = {
  id: number;
  item_code: string;
  item_name: string;
  sales_price: number;
  purchase_price?: number;
  status: string;
};

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (item: CreatedItem) => void;
};

/** Lightweight item create for line-item search modals. */
export function QuickItemModal(props: Props) {
  const toast = useToast();
  const [itemName, setItemName] = createSignal("");
  const [unit, setUnit] = createSignal("pc");
  const [salesPrice, setSalesPrice] = createSignal("0");
  const [purchasePrice, setPurchasePrice] = createSignal("0");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setItemName(props.initialName ?? "");
      setUnit("pc");
      setSalesPrice("0");
      setPurchasePrice("0");
      setError("");
      setSaving(false);
    }
  });

  const save = async () => {
    const name = itemName().trim();
    if (!name) {
      setError("Item name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CreatedItem>("/api/v1/inventory/items", {
      method: "POST",
      body: JSON.stringify({
        item_name: name,
        unit: unit().trim() || "pc",
        item_category: "merchandise",
        item_type: "item",
        sales_price: Number(salesPrice()) || 0,
        purchase_price: Number(purchasePrice()) || 0,
        status: "active",
        track_inventory_qty: true,
      }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const msg = res.errors?.item_name ?? res.message ?? "Failed to create item.";
      setError(msg);
      toast.warning(msg);
      return;
    }
    props.onCreated(res.data);
    props.onClose();
  };

  return (
    <Modal open={props.open} title="New item" onClose={props.onClose} stacked>
      <div class="space-y-4">
        <Field label="Item name *">
          <input
            class={inputClass}
            value={itemName()}
            onInput={(e) => setItemName(e.currentTarget.value)}
            placeholder="Product or service name"
            autofocus
          />
        </Field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Unit">
            <input class={inputClass} value={unit()} onInput={(e) => setUnit(e.currentTarget.value)} />
          </Field>
          <Field label="Sales price">
            <DecimalInput class={inputClass} value={salesPrice()} onValue={setSalesPrice} />
          </Field>
          <Field label="Purchase price">
            <DecimalInput class={inputClass} value={purchasePrice()} onValue={setPurchasePrice} />
          </Field>
        </div>
        <Show when={error()}>
          <p class="text-sm text-red-600">{error()}</p>
        </Show>
      </div>
      <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={saving() || itemName().trim() === ""}
          onClick={() => void save()}
        >
          {saving() ? "Creating…" : "Create item"}
        </button>
      </div>
    </Modal>
  );
}
