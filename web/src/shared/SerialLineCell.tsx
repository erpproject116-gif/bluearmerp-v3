import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";
import { SerialPickModal } from "./SerialPickModal";
import { SerialSaleScanner } from "./SerialSaleScanner";
import { useToast } from "./toast";
import type { UnifiedScanResponse } from "./SerialReceiveScanner";

export type SerialLineCellMode = "units" | "receive" | "planned";

type SerialEntry = { id: number; serial_no: string };

function truncateLabels(labels: string[], max = 3): string {
  if (labels.length === 0) return "";
  const shown = labels.slice(0, max).join(", ");
  if (labels.length <= max) return shown;
  return `${shown}, …`;
}

function summaryText(count: number, labels: string[]): string {
  if (count === 0) return "—";
  const text = truncateLabels(labels);
  return `${count} serial${count === 1 ? "" : "s"}: ${text}`;
}

type UnitsProps = {
  mode: "units";
  itemId?: number | null;
  locationId?: number | null;
  qty: number;
  serialUnitIds: number[];
  serialLabels?: string;
  context?: "sale" | "release" | "pos";
  disabled?: boolean;
  onChange: (unitIds: number[], labels: string, qty?: string) => void;
};

type ReceiveProps = {
  mode: "receive";
  grId: number;
  lineId: number;
  itemCode: string;
  itemName: string;
  expectedQty: number;
  receivedQty: number;
  serials: SerialEntry[];
  status: string;
  disabled?: boolean;
  onSerialsChange: (serials: SerialEntry[], receivedQty: number) => void;
  onAfterScan?: () => void;
};

type PlannedProps = {
  mode: "planned";
  qty: number;
  plannedSerials?: string[];
  disabled?: boolean;
  onChange?: (serials: string[]) => void;
};

export type SerialLineCellProps = UnitsProps | ReceiveProps | PlannedProps;

function patchReceiveLine(
  serials: SerialEntry[],
  receivedQty: number,
  expectedQty: number,
  result: { serial_id?: number; serial_no: string; status: string },
): { serials: SerialEntry[]; receivedQty: number } | null {
  if (!result.serial_id || (result.status !== "accepted" && result.status !== "idempotent_replay")) {
    return null;
  }
  if (serials.some((s) => s.serial_no === result.serial_no)) {
    return { serials, receivedQty };
  }
  return {
    serials: [...serials, { id: result.serial_id, serial_no: result.serial_no }],
    receivedQty: Math.min(expectedQty, receivedQty + 1),
  };
}

function UnitsSerialModal(props: UnitsProps & { open: boolean; onClose: () => void }) {
  const [pickOpen, setPickOpen] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.qty));
  const labels = () => (props.serialLabels ?? "").split(/,\s*/).filter(Boolean);

  return (
    <>
      <Modal open={props.open} title="Serial numbers" onClose={props.onClose} wide>
        <p class="mb-3 text-sm text-text-secondary">
          Assign {targetQty()} serial{targetQty() === 1 ? "" : "s"} ({props.serialUnitIds.length} selected).
        </p>
        <div class="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled || !props.itemId}
            onClick={() => setPickOpen(true)}
          >
            Pick from list
          </button>
        </div>
        <SerialSaleScanner
          itemId={props.itemId}
          locationId={props.locationId}
          serialUnitIds={props.serialUnitIds}
          serialLabels={props.serialLabels}
          context={props.context ?? "sale"}
          disabled={props.disabled}
          onChange={(ids, lbls, qty) => {
            props.onChange(ids, lbls, qty);
            if (ids.length === targetQty()) props.onClose();
          }}
        />
        <Show when={props.serialUnitIds.length > 0}>
          <ul class="mt-3 max-h-40 overflow-y-auto rounded border border-stroke text-sm">
            <For each={labels()}>{(sn) => <li class="border-b border-stroke/60 px-3 py-1 last:border-0">{sn}</li>}</For>
          </ul>
        </Show>
        <div class="mt-4 flex justify-end">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Done
          </button>
        </div>
      </Modal>

      <SerialPickModal
        open={pickOpen()}
        itemId={props.itemId ?? null}
        locationId={props.locationId}
        maxQty={targetQty()}
        selectedIds={props.serialUnitIds}
        onClose={() => setPickOpen(false)}
        onConfirm={(ids, serials) => {
          const lbls = serials.map((s) => s.serial_no).join(", ");
          props.onChange(ids, lbls, String(ids.length));
          setPickOpen(false);
        }}
      />
    </>
  );
}

function ReceiveSerialModal(props: ReceiveProps & { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [scanInput, setScanInput] = createSignal("");
  const [scanning, setScanning] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.expectedQty));

  const submitReceiveScan = async () => {
    const value = scanInput().trim();
    if (!value || scanning() || props.status !== "draft" || props.disabled) return;

    setScanning(true);
    const res = await apiFetch<UnifiedScanResponse>(
      `/api/v1/goods-receipt/goods-receipts/${props.grId}/scan`,
      {
        method: "POST",
        body: JSON.stringify({ scan: value, active_line_id: props.lineId }),
      },
      { silent: true },
    );
    setScanning(false);
    setScanInput("");

    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Scan failed.");
      return;
    }

    const data = res.data;
    if (data.mode === "serial_scan" && data.result) {
      const patched = patchReceiveLine(props.serials, props.receivedQty, props.expectedQty, data.result);
      if (patched) {
        props.onSerialsChange(patched.serials, patched.receivedQty);
        props.onAfterScan?.();
      } else {
        toast.warning(data.result.message ?? `${data.result.status}: ${data.result.serial_no}`);
      }
      return;
    }
    toast.warning(data.message ?? "Scan did not add a serial.");
  };

  const removeLastSerial = async () => {
    const serials = props.serials;
    if (serials.length === 0) return;
    const last = serials[serials.length - 1];
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${props.grId}/serials/${last.id}`,
      { method: "DELETE" },
      { silent: true },
    );
    if (!res.success) {
      toast.warning(res.message ?? "Failed to remove serial.");
      return;
    }
    const next = serials.slice(0, -1);
    props.onSerialsChange(next, Math.max(0, props.receivedQty - 1));
    props.onAfterScan?.();
    toast.success(`Removed ${last.serial_no}`);
  };

  return (
    <Modal open={props.open} title={`Receive serials — ${props.itemCode}`} onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-text-secondary">
        {props.itemName} · {props.serials.length} / {targetQty()} serials
      </p>
      <Show when={props.status === "draft"}>
        <input
          class={`${inputClass} mb-3 w-full`}
          value={scanInput()}
          disabled={props.disabled || scanning()}
          placeholder="Scan or type serial number…"
          onInput={(e) => setScanInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitReceiveScan();
            }
          }}
        />
        <div class="mb-3 flex gap-2">
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled || props.serials.length === 0}
            onClick={() => void removeLastSerial()}
          >
            Remove last
          </button>
        </div>
      </Show>
      <Show when={props.status !== "draft"}>
        <p class="mb-3 text-sm text-text-secondary">Receipt is posted — serials are read-only.</p>
      </Show>
      <ul class="max-h-48 overflow-y-auto rounded border border-stroke text-sm">
        <Show when={props.serials.length === 0}>
          <li class="px-3 py-4 text-center text-text-secondary">No serials yet.</li>
        </Show>
        <For each={props.serials}>
          {(s) => <li class="border-b border-stroke/60 px-3 py-1 last:border-0">{s.serial_no}</li>}
        </For>
      </ul>
      <div class="mt-4 flex justify-end">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function PlannedSerialModal(props: PlannedProps & { open: boolean; onClose: () => void }) {
  const [text, setText] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setText((props.plannedSerials ?? []).join("\n"));
    }
  });

  const targetQty = () => Math.max(1, Math.floor(props.qty));

  const apply = () => {
    const serials = text()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of serials) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
    }
    props.onChange?.(unique.slice(0, targetQty()));
    props.onClose();
  };

  return (
    <Modal open={props.open} title="Planned serial numbers" onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-amber-800">
        Planned only — enter up to {targetQty()} expected serial{targetQty() === 1 ? "" : "s"}. Real units are assigned at goods receipt or sale.
      </p>
      <textarea
        class={`${inputClass} mb-3 min-h-[140px] w-full font-mono text-sm`}
        value={text()}
        disabled={props.disabled}
        placeholder="SN001&#10;SN002"
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={props.disabled}
          onClick={apply}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

export function SerialLineCell(props: SerialLineCellProps) {
  const [open, setOpen] = createSignal(false);

  const labels = () => {
    if (props.mode === "units") {
      return (props.serialLabels ?? "").split(/,\s*/).filter(Boolean);
    }
    if (props.mode === "receive") {
      return props.serials.map((s) => s.serial_no);
    }
    return props.plannedSerials ?? [];
  };

  const count = () => {
    if (props.mode === "units") return props.serialUnitIds.length;
    if (props.mode === "receive") return props.serials.length;
    return (props.plannedSerials ?? []).length;
  };

  const targetQty = () => {
    if (props.mode === "units") return Math.max(1, Math.floor(props.qty));
    if (props.mode === "receive") return Math.max(1, Math.floor(props.expectedQty));
    return Math.max(1, Math.floor(props.qty));
  };

  const mismatch = () => count() > 0 && count() !== targetQty();

  const cellClass = () =>
    `w-full cursor-pointer rounded border px-2 py-1 text-left text-xs hover:bg-slate-50 ${
      mismatch() ? "border-amber-400 bg-amber-50 text-amber-900" : "border-stroke bg-white text-text-primary"
    } ${props.disabled ? "cursor-not-allowed opacity-50" : ""}`;

  const openModal = () => {
    if (props.disabled) return;
    setOpen(true);
  };

  const plannedSummary = () => {
    const n = count();
    if (n === 0) return "Planned: —";
    return `Planned: ${summaryText(n, labels())}`;
  };

  return (
    <>
      <button type="button" class={cellClass()} disabled={props.disabled} onClick={openModal} title="Click to manage serials">
        <Show when={props.mode === "planned"} fallback={<span>{summaryText(count(), labels())}</span>}>
          <span>{plannedSummary()}</span>
        </Show>
      </button>

      <Show when={props.mode === "units"}>
        <UnitsSerialModal
          {...(props as UnitsProps)}
          open={open()}
          onClose={() => setOpen(false)}
        />
      </Show>

      <Show when={props.mode === "receive"}>
        <ReceiveSerialModal
          {...(props as ReceiveProps)}
          open={open()}
          onClose={() => setOpen(false)}
        />
      </Show>

      <Show when={props.mode === "planned"}>
        <PlannedSerialModal
          {...(props as PlannedProps)}
          open={open()}
          onClose={() => setOpen(false)}
        />
      </Show>
    </>
  );
}
