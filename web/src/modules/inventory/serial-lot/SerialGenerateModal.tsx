import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { DEFAULT_SERIAL_SLIP_TYPE, SERIAL_SLIP_TYPES } from "../../../shared/serialSlipTypes";
import { useToast } from "../../../shared/toast";

type Generated = { id: number; serial_no: string; item_id: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerated: (serials: Generated[]) => void;
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

export function SerialGenerateModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [registerDate, setRegisterDate] = createSignal(todayISO());
  const [slipType, setSlipType] = createSignal(DEFAULT_SERIAL_SLIP_TYPE);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [prefix, setPrefix] = createSignal("SN");
  const [remark, setRemark] = createSignal("");
  const [lastGenerated, setLastGenerated] = createSignal<Generated[]>([]);

  const reset = () => {
    setRegisterDate(todayISO());
    setSlipType(DEFAULT_SERIAL_SLIP_TYPE);
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    setQty("1");
    setPrefix("SN");
    setRemark("");
    setLastGenerated([]);
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
    const res = await apiFetch<{ serials: Generated[]; count: number }>("/api/v1/inventory/serial-units/generate", {
      method: "POST",
      body: JSON.stringify({
        register_date: registerDate(),
        slip_type: slipType(),
        location_id: locationId(),
        item_id: itemId(),
        qty: qtyNum,
        prefix: prefix().trim() || "SN",
        remark: remark().trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error?.message || "Failed to generate serials.");
      return;
    }
    const serials = res.data?.serials ?? [];
    setLastGenerated(serials);
    toast.success(`Generated ${serials.length} unique serial number(s).`);
    props.onGenerated(serials);
  };

  const printLabels = () => {
    const rows = lastGenerated();
    if (rows.length === 0) {
      toast.warning("Generate serials first.");
      return;
    }
    const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!w) {
      toast.warning("Allow pop-ups to print labels.");
      return;
    }
    const labels = rows
      .map((s) => {
        const safe = s.serial_no.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        return `<div class="label"><div class="code">${safe}</div><div class="bc">*|${safe}|*</div></div>`;
      })
      .join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Serial labels</title>
<style>
body{font-family:ui-monospace,Menlo,Consolas,monospace;margin:12px}
.label{border:1px solid #333;padding:10px 12px;margin:0 8px 12px 0;display:inline-block;width:220px;vertical-align:top;page-break-inside:avoid}
.code{font-size:13px;font-weight:700;margin-bottom:6px;word-break:break-all}
.bc{letter-spacing:1px;font-size:14px;border-top:10px solid #000;border-bottom:10px solid #000;padding:4px 0;text-align:center}
@media print{body{margin:0}}
</style></head><body>${labels}<script>window.focus();setTimeout(function(){window.print()},200);<\/script></body></html>`);
    w.document.close();
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
        title="Unique serial labels"
        summary="For units without a supplier serial — generate unique numbers, print labels, and attach them."
        steps={[
          "Pick a serial-tracked item and stock location.",
          "Choose quantity (1–200). Numbers are unique per business (tenant).",
          "Generate, then Print labels.",
        ]}
      />
      <Field label="Date *">
        <DateInput value={registerDate()} onInput={(e) => setRegisterDate(e.currentTarget.value)} />
      </Field>
      <Field label="Slip type *">
        <select class={inputClass} value={slipType()} onChange={(e) => setSlipType(e.currentTarget.value)}>
          <For each={[...SERIAL_SLIP_TYPES]}>{(t) => <option value={t.value}>{t.label}</option>}</For>
        </select>
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
      <Field label="Prefix">
        <input class={inputClass} value={prefix()} onInput={(e) => setPrefix(e.currentTarget.value)} maxlength={16} />
      </Field>
      <Field label="Remark">
        <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
      </Field>
      <Show when={lastGenerated().length > 0}>
        <div class="col-span-full mt-2 rounded-lg border border-stroke bg-brand-50/40 p-3">
          <p class="mb-2 text-sm font-medium text-text-primary">Generated ({lastGenerated().length})</p>
          <ul class="mb-3 max-h-32 overflow-y-auto font-mono text-xs text-text-secondary">
            <For each={lastGenerated()}>{(s) => <li>{s.serial_no}</li>}</For>
          </ul>
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white" onClick={printLabels}>
            Print labels
          </button>
        </div>
      </Show>
    </EntityModal>
  );
}
