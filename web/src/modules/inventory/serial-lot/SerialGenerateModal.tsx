import { createEffect, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { DEFAULT_SERIAL_PREFIX, formatAutoSerial, printCode128Labels } from "../../../shared/printCode128Labels";
import { DEFAULT_SERIAL_SLIP_TYPE } from "../../../shared/serialSlipTypes";
import { useToast } from "../../../shared/toast";

type Generated = { id: number; serial_no: string; item_id: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerated: (serials: Generated[]) => void;
  /** Prefill when opened from item master / list. */
  initialItemId?: number | null;
  initialItemLabel?: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string; track_serial?: boolean }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? [])
    .filter((i) => i.track_serial !== false)
    .map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

function normalizePrefix(raw: string): string {
  return (raw || DEFAULT_SERIAL_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || DEFAULT_SERIAL_PREFIX;
}

export function SerialGenerateModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [registerDate, setRegisterDate] = createSignal(todayISO());
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [prefix, setPrefix] = createSignal(DEFAULT_SERIAL_PREFIX);
  const [remark, setRemark] = createSignal("");

  const reset = () => {
    setRegisterDate(todayISO());
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    setQty("1");
    setPrefix(DEFAULT_SERIAL_PREFIX);
    setRemark("");
  };

  createEffect(() => {
    if (!props.open) return;
    if (props.initialItemId) {
      setItemId(props.initialItemId);
      setItemLabel(props.initialItemLabel ?? "");
    }
  });

  const formatPreview = () => {
    const d = registerDate() ? new Date(registerDate() + "T12:00:00") : new Date();
    return formatAutoSerial(normalizePrefix(prefix()), d, 1);
  };

  const generate = async () => {
    if (!itemId() || !locationId()) {
      toast.warning("Item and location are required.");
      return;
    }
    const qtyNum = Math.floor(Number(qty()));
    if (!Number.isFinite(qtyNum) || qtyNum < 1 || qtyNum > 200) {
      toast.warning("Quantity must be between 1 and 200.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ serials: Generated[]; count: number }>(
        "/api/v1/inventory/serial-units/generate",
        {
          method: "POST",
          body: JSON.stringify({
            register_date: registerDate(),
            slip_type: DEFAULT_SERIAL_SLIP_TYPE,
            location_id: locationId(),
            item_id: itemId(),
            qty: qtyNum,
            prefix: normalizePrefix(prefix()),
            remark: remark().trim(),
          }),
        },
        { silent: true },
      );
      if (!res.success) {
        const fieldErr = res.errors ? Object.values(res.errors)[0] : undefined;
        toast.error(fieldErr || res.message || "Failed to generate serials.");
        return;
      }
      const serials = res.data?.serials ?? [];
      // Close first so list refresh cannot leave the dialog stuck open (same as register).
      reset();
      props.onClose();
      props.onGenerated(serials);
      if (serials.length > 0) {
        toast.action({
          type: "success",
          title: `Generated ${serials.length} unique serial number(s).`,
          message: "Already in stock — use Print labels for Code128 stickers, not Purchase Receive paste.",
          actionLabel: "Print labels",
          onAction: () => {
            if (
              !printCode128Labels({
                title: "Serial labels",
                rows: serials.map((s) => ({ code: s.serial_no })),
              })
            ) {
              toast.warning("Allow pop-ups to print labels.");
            }
          },
        });
      } else {
        toast.success("Generated serial numbers.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal
      open={props.open}
      title="Generate serial numbers"
      onClose={() => {
        reset();
        props.onClose();
      }}
      onSave={() => void generate()}
      saving={saving()}
      saveLabel="Generate"
    >
      <ModalFormGuide
        guideId="serial_generate"
        spanFull
        title="Generate puts serials into stock"
        summary="Generated numbers are registered as already on hand. Do not paste them into Purchase Receive (duplicates are rejected). Use Generate for labels of stock you already own. For supplier deliveries, scan the serials on the boxes in Purchase Receive."
        steps={[
          "Pick a serial-tracked item and stock location.",
          "Set company prefix (default BA) and quantity (1–200).",
          "Generate — the dialog closes; use Print labels on the success toast for Code128 stickers.",
          "Receiving a delivery? Open Purchase Receive and scan physical labels instead.",
        ]}
      />
      <Field label="Date *">
        <DateInput value={registerDate()} onInput={(e) => setRegisterDate(e.currentTarget.value)} />
      </Field>
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
      <Field label="Qty *">
        <input class={inputClass} type="number" min="1" max="200" value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
      </Field>
      <Field label="Company prefix">
        <input
          class={inputClass}
          value={prefix()}
          onInput={(e) => setPrefix(e.currentTarget.value)}
          maxlength={16}
          placeholder={DEFAULT_SERIAL_PREFIX}
        />
        <p class="mt-1 font-mono text-xs text-text-secondary">Preview: {formatPreview()}</p>
      </Field>
      <Field label="Remark">
        <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
      </Field>
    </EntityModal>
  );
}
