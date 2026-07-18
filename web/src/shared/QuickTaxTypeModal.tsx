import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { DecimalInput } from "./DecimalInput";
import { apiFetch } from "./api";
import { useToast } from "./toast";

export type CreatedTaxType = {
  id: number;
  tax_code: string;
  name: string;
  tax_mode: string;
  rate_percent: number;
  status: string;
};

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (row: CreatedTaxType) => void;
};

export function QuickTaxTypeModal(props: Props) {
  const toast = useToast();
  const [name, setName] = createSignal("");
  const [taxMode, setTaxMode] = createSignal("excluded");
  const [ratePercent, setRatePercent] = createSignal("12");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setName(props.initialName ?? "");
      setTaxMode("excluded");
      setRatePercent("12");
      setError("");
      setSaving(false);
    }
  });

  const save = async () => {
    const n = name().trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CreatedTaxType>("/api/v1/quotation/tax-types", {
      method: "POST",
      body: JSON.stringify({
        name: n,
        tax_mode: taxMode(),
        rate_percent: Number(ratePercent()) || 0,
        sort_order: 0,
        status: "active",
      }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const msg = res.errors?.name ?? res.message ?? "Failed to create tax type.";
      setError(msg);
      toast.warning(msg);
      return;
    }
    props.onCreated(res.data);
    props.onClose();
  };

  return (
    <Modal open={props.open} title="New tax type" onClose={props.onClose} stacked>
      <div class="space-y-4">
        <Field label="Name *">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} autofocus />
        </Field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tax mode">
            <select class={inputClass} value={taxMode()} onChange={(e) => setTaxMode(e.currentTarget.value)}>
              <option value="excluded">Excluded (add-on)</option>
              <option value="included">Included</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="Rate %">
            <DecimalInput class={inputClass} value={ratePercent()} onValue={setRatePercent} />
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
          disabled={saving() || name().trim() === ""}
          onClick={() => void save()}
        >
          {saving() ? "Creating…" : "Create tax type"}
        </button>
      </div>
    </Modal>
  );
}
