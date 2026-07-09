import { For, createEffect, createSignal } from "solid-js";
import { Modal } from "../../shared/Modal";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ITEM_CATEGORY_OPTIONS, ITEM_TYPE_OPTIONS } from "../../shared/itemMasterConstants";

export type ItemsAdvancedFilters = {
  item_code?: string;
  item_name?: string;
  spec_name?: string;
  item_category?: string;
  item_type?: string;
  track_serial?: "" | "true" | "false";
  track_lot?: "" | "true" | "false";
};

export const emptyItemsAdvancedFilters = (): ItemsAdvancedFilters => ({});

type Props = {
  open: boolean;
  initial: ItemsAdvancedFilters;
  onClose: () => void;
  onApply: (filters: ItemsAdvancedFilters) => void;
  onClear: () => void;
};

export function ItemsAdvancedSearch(props: Props) {
  const [draft, setDraft] = createSignal<ItemsAdvancedFilters>({});

  createEffect(() => {
    if (props.open) setDraft({ ...props.initial });
  });

  const patch = (p: Partial<ItemsAdvancedFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  return (
    <Modal open={props.open} title="Advanced item search (F3)" wide onClose={props.onClose}>
      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Item code">
          <input class={inputClass} value={draft().item_code ?? ""} onInput={(e) => patch({ item_code: e.currentTarget.value })} />
        </Field>
        <Field label="Item name">
          <input class={inputClass} value={draft().item_name ?? ""} onInput={(e) => patch({ item_name: e.currentTarget.value })} />
        </Field>
        <Field label="Spec name">
          <input class={inputClass} value={draft().spec_name ?? ""} onInput={(e) => patch({ spec_name: e.currentTarget.value })} />
        </Field>
        <Field label="Category (legacy)">
          <select class={inputClass} value={draft().item_category ?? ""} onChange={(e) => patch({ item_category: e.currentTarget.value || undefined })}>
            <option value="">Any</option>
            <For each={ITEM_CATEGORY_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Field>
        <Field label="Item type">
          <select class={inputClass} value={draft().item_type ?? ""} onChange={(e) => patch({ item_type: e.currentTarget.value || undefined })}>
            <option value="">Any</option>
            <For each={ITEM_TYPE_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </Field>
        <Field label="Serial tracking">
          <select class={inputClass} value={draft().track_serial ?? ""} onChange={(e) => patch({ track_serial: e.currentTarget.value as ItemsAdvancedFilters["track_serial"] })}>
            <option value="">Any</option>
            <option value="true">Track serial</option>
            <option value="false">No serial</option>
          </select>
        </Field>
        <Field label="Lot tracking">
          <select class={inputClass} value={draft().track_lot ?? ""} onChange={(e) => patch({ track_lot: e.currentTarget.value as ItemsAdvancedFilters["track_lot"] })}>
            <option value="">Any</option>
            <option value="true">Track lot</option>
            <option value="false">No lot</option>
          </select>
        </Field>
      </div>
      <div class="mt-6 flex justify-end gap-2 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
          onClick={() => {
            props.onClear();
            props.onClose();
          }}
        >
          Clear
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => {
            props.onApply(draft());
            props.onClose();
          }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
