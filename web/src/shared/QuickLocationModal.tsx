import { createEffect, createSignal, Show } from "solid-js";
import { Modal } from "./Modal";
import { Field, inputClass } from "./SpreadsheetGrid";
import { apiFetch } from "./api";
import { useToast } from "./toast";

export type CreatedLocation = {
  id: number;
  location_code: string;
  location_name: string;
};

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (loc: CreatedLocation) => void;
};

export function QuickLocationModal(props: Props) {
  const toast = useToast();
  const [locationName, setLocationName] = createSignal("");
  const [locationType, setLocationType] = createSignal("location");
  const [productionProcess, setProductionProcess] = createSignal("bundle");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setLocationName(props.initialName ?? "");
      setLocationType("location");
      setProductionProcess("bundle");
      setError("");
      setSaving(false);
    }
  });

  const save = async () => {
    const name = locationName().trim();
    if (!name) {
      setError("Location name is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<CreatedLocation>("/api/v1/inventory/locations", {
      method: "POST",
      body: JSON.stringify({
        location_name: name,
        location_type: locationType(),
        production_process: productionProcess(),
        status: "active",
      }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const msg = res.errors?.location_name ?? res.message ?? "Failed to create location.";
      setError(msg);
      toast.warning(msg);
      return;
    }
    props.onCreated(res.data);
    props.onClose();
  };

  return (
    <Modal open={props.open} title="New location" onClose={props.onClose} stacked>
      <div class="space-y-4">
        <Field label="Location name *">
          <input
            class={inputClass}
            value={locationName()}
            onInput={(e) => setLocationName(e.currentTarget.value)}
            autofocus
          />
        </Field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select class={inputClass} value={locationType()} onChange={(e) => setLocationType(e.currentTarget.value)}>
              <option value="location">Location</option>
              <option value="factory">Factory</option>
              <option value="factory_oe_manage">Factory (OE manage)</option>
            </select>
          </Field>
          <Field label="Production process">
            <select
              class={inputClass}
              value={productionProcess()}
              onChange={(e) => setProductionProcess(e.currentTarget.value)}
            >
              <option value="bundle">Bundle</option>
              <option value="service">Service</option>
            </select>
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
          disabled={saving() || locationName().trim() === ""}
          onClick={() => void save()}
        >
          {saving() ? "Creating…" : "Create location"}
        </button>
      </div>
    </Modal>
  );
}
