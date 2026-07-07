import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "./api";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";
import { ScannedSerialTable } from "./ScannedSerialTable";
import { SerialPickModal } from "./SerialPickModal";
import { SerialSaleScanner } from "./SerialSaleScanner";
import type { ResolvedSerialUnit } from "./serialScanTypes";
import { useToast } from "./toast";
import { useSerialScanQueue } from "./useSerialScanQueue";

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
  itemCode?: string;
  itemName?: string;
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

function receiveRowsFromSerials(serials: SerialEntry[], itemCode: string, itemName: string): ResolvedSerialUnit[] {
  return serials.map((s) => ({
    serial_unit_id: s.id,
    serial_no: s.serial_no,
    item_id: 0,
    item_code: itemCode,
    item_name: itemName,
    status: "received",
  }));
}

function UnitsSerialModal(props: UnitsProps & { open: boolean; onClose: () => void }) {
  const [pickOpen, setPickOpen] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.qty));

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
          itemCode={props.itemCode}
          itemName={props.itemName}
          locationId={props.locationId}
          maxQty={targetQty()}
          serialUnitIds={props.serialUnitIds}
          serialLabels={props.serialLabels}
          context={props.context ?? "sale"}
          disabled={props.disabled}
          onChange={(ids, lbls, qty) => props.onChange(ids, lbls, qty)}
          onComplete={() => props.onClose()}
        />
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
        itemLabel={props.itemCode ? `${props.itemCode} — ${props.itemName ?? ""}` : undefined}
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
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [pasteText, setPasteText] = createSignal("");
  const [pasteBusy, setPasteBusy] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.expectedQty));

  const scanQueue = useSerialScanQueue(() => (props.open ? props.grId : null));

  const appliedScanIds = new Set<string>();

  createEffect(() => {
    if (props.open) scanQueue.initFromStorage(props.grId);
    else appliedScanIds.clear();
  });

  createEffect(() => {
    const q = scanQueue.queue();
    const done = q.filter(
      (item) =>
        item.goods_receipt_line_id === props.lineId &&
        (item.status === "accepted" || item.status === "replay") &&
        !appliedScanIds.has(item.client_scan_id),
    );
    if (done.length === 0) return;

    let serials = props.serials;
    let receivedQty = props.receivedQty;
    for (const item of done) {
      appliedScanIds.add(item.client_scan_id);
      const patched = patchReceiveLine(serials, receivedQty, props.expectedQty, {
        serial_id: item.serial_id,
        serial_no: item.serial_no,
        status: item.status === "replay" ? "idempotent_replay" : "accepted",
      });
      if (patched) {
        serials = patched.serials;
        receivedQty = patched.receivedQty;
      }
    }
    if (serials !== props.serials || receivedQty !== props.receivedQty) {
      props.onSerialsChange(serials, receivedQty);
      props.onAfterScan?.();
    }
  });

  const submitScan = () => {
    const value = scanInput().trim();
    if (!value || props.status !== "draft" || props.disabled) return;
    if (props.serials.length >= targetQty()) {
      toast.warning(`Line already has ${targetQty()} serial(s).`);
      return;
    }
    scanQueue.enqueue(props.lineId, value);
    setScanInput("");
  };

  const importPasted = async () => {
    const lines = pasteText()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.warning("Paste at least one serial number.");
      return;
    }
    setPasteBusy(true);
    for (const sn of lines) {
      if (props.serials.length + scanQueue.pendingCount() >= targetQty()) break;
      scanQueue.enqueue(props.lineId, sn);
    }
    await scanQueue.flushNow();
    setPasteBusy(false);
    setPasteText("");
    setPasteOpen(false);
    toast.success(`Queued ${lines.length} serial(s).`);
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

  const tableRows = () => receiveRowsFromSerials(props.serials, props.itemCode, props.itemName);

  const rejectedRows = (): (ResolvedSerialUnit & { error: string })[] => {
    const q = scanQueue.queue().filter(
      (item) => item.goods_receipt_line_id === props.lineId && item.status === "rejected",
    );
    return q.map((item) => ({
      serial_unit_id: 0,
      serial_no: item.serial_no,
      item_id: 0,
      item_code: props.itemCode,
      item_name: props.itemName,
      status: "rejected",
      error: item.message ?? "Rejected",
    }));
  };

  return (
    <Modal open={props.open} title={`Receive serials — ${props.itemCode}`} onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-text-secondary">
        {props.itemName} · {props.serials.length} / {targetQty()} serials
      </p>
      <Show when={props.status === "draft"}>
        <div class="mb-3 flex flex-wrap gap-2">
          <input
            class={`${inputClass} min-w-[12rem] flex-1`}
            value={scanInput()}
            disabled={props.disabled || scanQueue.flushing()}
            placeholder="Scan or type serial number…"
            onInput={(e) => setScanInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitScan();
              }
            }}
          />
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled}
            onClick={() => setPasteOpen(true)}
          >
            Paste serials
          </button>
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled || props.serials.length === 0}
            onClick={() => void removeLastSerial()}
          >
            Remove last
          </button>
        </div>
        <Show when={scanQueue.pendingCount() > 0 || scanQueue.flushing()}>
          <p class="mb-2 text-xs text-text-secondary">
            {scanQueue.flushing() ? "Flushing scans…" : `${scanQueue.pendingCount()} pending…`}
          </p>
        </Show>
      </Show>
      <Show when={props.status !== "draft"}>
        <p class="mb-3 text-sm text-text-secondary">Receipt is posted — serials are read-only.</p>
      </Show>

      <ScannedSerialTable
        units={[...rejectedRows(), ...tableRows()]}
        maxQty={targetQty()}
        disabled={props.disabled || props.status !== "draft"}
        showItemDetails
      />

      <Show when={pasteOpen()}>
        <div class="mt-3 rounded-lg border border-stroke bg-slate-50 p-3">
          <p class="mb-2 text-sm text-text-secondary">One serial number per line.</p>
          <textarea
            class={`${inputClass} mb-2 min-h-[100px] w-full font-mono text-sm`}
            value={pasteText()}
            disabled={pasteBusy()}
            onInput={(e) => setPasteText(e.currentTarget.value)}
          />
          <div class="flex justify-end gap-2">
            <button type="button" class="rounded border border-stroke px-3 py-1 text-sm" onClick={() => setPasteOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              class="rounded bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={pasteBusy()}
              onClick={() => void importPasted()}
            >
              Import
            </button>
          </div>
        </div>
      </Show>

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
  const [scanInput, setScanInput] = createSignal("");
  const [filter, setFilter] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setText((props.plannedSerials ?? []).join("\n"));
      setScanInput("");
      setFilter("");
    }
  });

  const targetQty = () => Math.max(1, Math.floor(props.qty));

  const serialList = () =>
    text()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

  const filteredList = () => {
    const q = filter().trim().toLowerCase();
    const list = serialList();
    if (!q) return list;
    return list.filter((s) => s.toLowerCase().includes(q));
  };

  const appendScan = () => {
    const sn = scanInput().trim();
    if (!sn || props.disabled) return;
    const existing = serialList();
    if (existing.some((s) => s.toLowerCase() === sn.toLowerCase())) return;
    if (existing.length >= targetQty()) return;
    setText([...existing, sn].join("\n"));
    setScanInput("");
  };

  const apply = () => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const s of serialList()) {
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
      <div class="mb-3 flex gap-2">
        <input
          class={`${inputClass} flex-1`}
          value={scanInput()}
          disabled={props.disabled}
          placeholder="Scan serial (Enter)…"
          onInput={(e) => setScanInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              appendScan();
            }
          }}
        />
        <span class="self-center text-xs text-text-secondary">
          {serialList().length} / {targetQty()}
        </span>
      </div>
      <input
        class={`${inputClass} mb-2 w-full`}
        value={filter()}
        disabled={props.disabled}
        placeholder="Search planned serials…"
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
      <textarea
        class={`${inputClass} mb-3 min-h-[120px] w-full font-mono text-sm`}
        value={text()}
        disabled={props.disabled}
        placeholder="SN001&#10;SN002"
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <Show when={filter().trim() && filteredList().length > 0}>
        <p class="mb-2 text-xs text-text-secondary">{filteredList().length} match(es)</p>
      </Show>
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
        <UnitsSerialModal {...(props as UnitsProps)} open={open()} onClose={() => setOpen(false)} />
      </Show>

      <Show when={props.mode === "receive"}>
        <ReceiveSerialModal {...(props as ReceiveProps)} open={open()} onClose={() => setOpen(false)} />
      </Show>

      <Show when={props.mode === "planned"}>
        <PlannedSerialModal {...(props as PlannedProps)} open={open()} onClose={() => setOpen(false)} />
      </Show>
    </>
  );
}
