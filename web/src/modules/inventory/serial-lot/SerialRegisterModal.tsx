import { createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { DEFAULT_SERIAL_SLIP_TYPE, SERIAL_SLIP_TYPES } from "../../../shared/serialSlipTypes";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import type { SerialUnitRow } from "../../../shared/useSerialLotList";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchProjects(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_name: string }[]>(`/api/v1/inventory/projects?${qs}`);
  return (res.data ?? []).map((p) => ({ id: p.id, label: p.project_name }));
}

export function SerialRegisterModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [registerDate, setRegisterDate] = createSignal(todayISO());
  const [slipType, setSlipType] = createSignal(DEFAULT_SERIAL_SLIP_TYPE);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [serialNo, setSerialNo] = createSignal("");
  const [remark, setRemark] = createSignal("");

  const reset = () => {
    setRegisterDate(todayISO());
    setSlipType(DEFAULT_SERIAL_SLIP_TYPE);
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    setProjectId(null);
    setProjectLabel("");
    setQty("1");
    setSerialNo("");
    setRemark("");
  };

  const save = async () => {
    if (!itemId() || !locationId()) {
      toast.warning("Item and location are required.");
      return;
    }
    if (!serialNo().trim()) {
      toast.warning("Serial number is required.");
      return;
    }
    const qtyNum = Number(qty());
    if (qtyNum !== 1 || Number.isNaN(qtyNum)) {
      toast.warning("Quantity must be 1 for serial-tracked items.");
      return;
    }
    setSaving(true);
    try {
      const ok = await submitEntity(
        () =>
          apiFetch<SerialUnitRow>("/api/v1/inventory/serial-units/register", {
            method: "POST",
            body: JSON.stringify({
              register_date: registerDate(),
              slip_type: slipType(),
              location_id: locationId(),
              item_id: itemId(),
              qty: qtyNum,
              serial_no: serialNo().trim(),
              remark: remark().trim(),
              project_id: projectId() ?? undefined,
            }),
          }, { silent: true }),
        toast,
        "Serial registered.",
      );
      if (!ok) return;
      // Close first so a list refresh cannot leave the dialog stuck open.
      reset();
      props.onClose();
      props.onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal
      open={props.open}
      title="Register serial / lot no."
      onClose={() => {
        reset();
        props.onClose();
      }}
      onSave={() => void save()}
      saving={saving()}
    >
      <ModalFormGuide guideId="serial_register" spanFull />
      <Field label="Date *">
        <DateInput value={registerDate()} onInput={(e) => setRegisterDate(e.currentTarget.value)} />
      </Field>
      <Field label="Slip type *">
        <select class={inputClass} value={slipType()} onChange={(e) => setSlipType(e.currentTarget.value)}>
          {SERIAL_SLIP_TYPES.map((t) => (
            <option value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <LookupCombo
        label="Location *"
        value={locationLabel}
        selectedId={locationId}
        onInput={setLocationLabel}
        onSelect={(o) => {
          setLocationId(o.id);
          setLocationLabel(o.label);
        }}
        onClear={() => {
          setLocationId(null);
          setLocationLabel("");
        }}
        fetchOptions={fetchLocations}
      />
      <LookupCombo
        label="Item *"
        value={itemLabel}
        selectedId={itemId}
        onInput={setItemLabel}
        onSelect={(o) => {
          setItemId(o.id);
          setItemLabel(o.label);
        }}
        onClear={() => {
          setItemId(null);
          setItemLabel("");
        }}
        fetchOptions={fetchItems}
      />
      <Field label="Qty *">
        <input
          type="number"
          min="1"
          max="1"
          step="1"
          class={inputClass}
          value={qty()}
          onInput={(e) => setQty(e.currentTarget.value)}
        />
      </Field>
      <Field label="Serial / lot no. *">
        <input class={inputClass} value={serialNo()} onInput={(e) => setSerialNo(e.currentTarget.value)} />
      </Field>
      <Field label="Remark" span="full">
        <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
      </Field>
      <LookupCombo
        label="Project"
        value={projectLabel}
        selectedId={projectId}
        onInput={setProjectLabel}
        onSelect={(o) => {
          setProjectId(o.id);
          setProjectLabel(o.label);
        }}
        onClear={() => {
          setProjectId(null);
          setProjectLabel("");
        }}
        fetchOptions={fetchProjects}
      />
    </EntityModal>
  );
}
