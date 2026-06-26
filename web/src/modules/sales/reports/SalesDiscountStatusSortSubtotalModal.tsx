import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "../../../shared/Modal";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  DISCOUNT_SORT_OPTIONS,
  DISCOUNT_SUBTOTAL_OPTIONS,
  type DiscountSortField,
  type SalesDiscountStatusTemplate,
} from "./salesDiscountStatusTemplate";

type Props = {
  open: boolean;
  value: SalesDiscountStatusTemplate;
  onClose: () => void;
  onApply: (next: SalesDiscountStatusTemplate) => void;
};

export function SalesDiscountStatusSortSubtotalModal(props: Props) {
  const [draft, setDraft] = createSignal<SalesDiscountStatusTemplate>(props.value);

  createEffect(() => {
    if (props.open) setDraft({ ...props.value });
  });

  const patch = (p: Partial<SalesDiscountStatusTemplate>) => setDraft((prev) => ({ ...prev, ...p }));

  return (
    <Modal open={props.open} title="Sort/Subtotal Criteria" onClose={() => props.onClose()}>
      <div class="grid gap-4">
        <Field label="1st sort by">
          <select
            class={inputClass}
            value={draft().sortField}
            onChange={(e) => patch({ sortField: e.currentTarget.value as DiscountSortField })}
          >
            {DISCOUNT_SORT_OPTIONS.map((o) => (
              <option value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="1st sort order">
          <select
            class={inputClass}
            value={draft().sortOrder}
            onChange={(e) => patch({ sortOrder: e.currentTarget.value as "asc" | "desc" })}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </Field>
        <Field label="2nd sort by (optional)">
          <select
            class={inputClass}
            value={draft().sortField2}
            onChange={(e) => patch({ sortField2: e.currentTarget.value as DiscountSortField | "" })}
          >
            <option value="">— None —</option>
            {DISCOUNT_SORT_OPTIONS.filter((o) => o.value !== draft().sortField).map((o) => (
              <option value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Show when={draft().sortField2}>
          <Field label="2nd sort order">
            <select
              class={inputClass}
              value={draft().sortOrder2}
              onChange={(e) => patch({ sortOrder2: e.currentTarget.value as "asc" | "desc" })}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </Field>
        </Show>
        <Field label="Subtotal by">
          <select
            class={inputClass}
            value={draft().subtotalBy}
            onChange={(e) => patch({ subtotalBy: e.currentTarget.value as SalesDiscountStatusTemplate["subtotalBy"] })}
          >
            {DISCOUNT_SUBTOTAL_OPTIONS.map((o) => (
              <option value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <p class="text-xs text-text-secondary">
          Subtotals appear on Sales Amount, Invoicing Amount, and Difference Amount. When subtotal is enabled, all matching rows load (up to 5,000).
        </p>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white"
          onClick={() => props.onApply(draft())}
        >
          Apply
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>
          Close
        </button>
      </div>
    </Modal>
  );
}
