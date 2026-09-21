import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import type { SerialUnitRow } from "../../../shared/useSerialLotList";

type Props = {
  open: boolean;
  row: SerialUnitRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SerialEditModal(props: Props) {
  const toast = useToast();
  const [serialNo, setSerialNo] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (props.open && props.row) setSerialNo(props.row.serial_no);
  });

  const save = async () => {
    const row = props.row;
    if (!row) return;
    const next = serialNo().trim();
    if (!next) {
      toast.warning("Serial number is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/api/v1/inventory/serial-units/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ serial_no: next }),
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Could not update serial.");
      return;
    }
    toast.success("Serial updated.");
    props.onSaved();
    props.onClose();
  };

  return (
    <EntityModal
      open={props.open}
      title={props.row ? `Edit serial ${props.row.serial_no}` : "Edit serial"}
      onClose={props.onClose}
      onSave={() => void save()}
      saving={saving()}
    >
      <p class="mb-3 text-xs text-text-secondary">
        Rename only. Sold or voided units cannot be renamed. For warranty dates, open the serial trace.
      </p>
      <Field label="Serial number" required>
        <input class={inputClass} value={serialNo()} onInput={(e) => setSerialNo(e.currentTarget.value)} />
      </Field>
      <Show when={props.row}>
        <p class="mt-2 text-xs text-text-secondary">
          {props.row!.item_code} — {props.row!.item_name} · {props.row!.location_name || "No location"}
        </p>
      </Show>
    </EntityModal>
  );
}
