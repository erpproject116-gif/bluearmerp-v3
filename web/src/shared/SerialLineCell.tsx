import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "./api";
import { InlineSerialBulkField } from "./InlineSerialBulkField";
import { Modal } from "./Modal";
import { DEFAULT_SERIAL_PREFIX } from "./printCode128Labels";
import { inputClass } from "./SpreadsheetGrid";
import { resolveSerialBulk } from "./resolveSerialBulk";
import { ScannedSerialTable } from "./ScannedSerialTable";
import { SerialPickModal } from "./SerialPickModal";
import { SerialSaleScanner } from "./SerialSaleScanner";
import { dedupeSerials, formatSerialBulkList, parseSerialBulkInput } from "./serialBulkParse";
import type { ResolvedSerialUnit } from "./serialScanTypes";
import { serialUnitsToChange } from "./serialScanTypes";
import { useToast } from "./toast";
import { useSerialScanQueue } from "./useSerialScanQueue";

export type SerialLineCellMode = "units" | "receive" | "planned";

type SerialEntry = { id: number; serial_no: string };

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
  /**
   * Scan-first: when the line is empty or the serial belongs to a different item,
   * parent fills/replaces the row from resolved units (same as DocumentSerialScanBar).
   */
  onPopulateFromUnits?: (units: ResolvedSerialUnit[]) => void | Promise<void>;
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
  /** Resolve registered serials and let parent fill the item line (purchase/PR). */
  onPopulateFromUnits?: (units: ResolvedSerialUnit[]) => void | Promise<void>;
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
          Scan or pick serials — {props.serialUnitIds.length} / {targetQty()} assigned.
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

  const enqueueSerials = async (serialNos: string[]) => {
    const existing = new Set(props.serials.map((s) => s.serial_no.toLowerCase()));
    let queued = 0;
    for (const sn of serialNos) {
      if (props.serials.length + scanQueue.pendingCount() + queued >= targetQty()) break;
      if (existing.has(sn.toLowerCase())) continue;
      scanQueue.enqueue(props.lineId, sn);
      queued++;
    }
    if (queued > 0) await scanQueue.flushNow();
  };

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
    const lines = dedupeSerials(parseSerialBulkInput(pasteText()));
    if (lines.length === 0) {
      toast.warning("Paste at least one serial number.");
      return;
    }
    setPasteBusy(true);
    await enqueueSerials(lines);
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
        units={[...rejectedRows(), ...receiveRowsFromSerials(props.serials, props.itemCode, props.itemName)]}
        maxQty={targetQty()}
        disabled={props.disabled || props.status !== "draft"}
        showItemDetails
      />

      <Show when={pasteOpen()}>
        <div class="mt-3 rounded-lg border border-stroke bg-slate-50 p-3">
          <p class="mb-2 text-sm text-text-secondary">Comma-separated or one serial per line.</p>
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
  const toast = useToast();
  const [text, setText] = createSignal("");
  const [prefix, setPrefix] = createSignal(DEFAULT_SERIAL_PREFIX);
  const [allocating, setAllocating] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.qty));

  createEffect(() => {
    if (props.open) {
      setText(formatSerialBulkList(props.plannedSerials ?? []));
      setPrefix(DEFAULT_SERIAL_PREFIX);
    }
  });

  const apply = () => {
    const unique = dedupeSerials(parseSerialBulkInput(text()));
    props.onChange?.(unique.slice(0, targetQty()));
    props.onClose();
  };

  const autoGenerate = async () => {
    const need = targetQty();
    if (need < 1) return;
    setAllocating(true);
    const res = await apiFetch<{ serials: string[]; count: number }>("/api/v1/inventory/serial-units/allocate-numbers", {
      method: "POST",
      body: JSON.stringify({
        qty: need,
        prefix: (prefix() || DEFAULT_SERIAL_PREFIX).trim(),
        register_date: new Date().toISOString().slice(0, 10),
      }),
    });
    setAllocating(false);
    if (!res.ok) {
      toast.error(res.message || "Failed to allocate serial numbers.");
      return;
    }
    const serials = res.data?.serials ?? [];
    setText(formatSerialBulkList(serials));
    toast.success(`Allocated ${serials.length} serial number(s). Review and Apply.`);
  };

  return (
    <Modal open={props.open} title="Planned serial numbers" onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-amber-800">
        Planned only — up to {targetQty()} expected serial{targetQty() === 1 ? "" : "s"}. Comma-separated or one per line.
        Auto-generate uses prefix + date (MMDDYY) + sequence (e.g. BA072726000001).
      </p>
      <div class="mb-3 flex flex-wrap items-end gap-2">
        <label class="block text-xs font-medium text-text-secondary">
          Company prefix
          <input
            class={`${inputClass} mt-1 w-28 font-mono`}
            value={prefix()}
            disabled={props.disabled || allocating()}
            maxlength={16}
            onInput={(e) => setPrefix(e.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          class="rounded-lg border border-brand-600 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          disabled={props.disabled || allocating()}
          onClick={() => void autoGenerate()}
        >
          {allocating() ? "Generating…" : `Auto-generate ${targetQty()}`}
        </button>
      </div>
      <textarea
        class={`${inputClass} mb-3 min-h-[120px] w-full font-mono text-sm`}
        value={text()}
        disabled={props.disabled}
        placeholder="BA072726000001"
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

function PlannedSerialCell(props: PlannedProps) {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const [resolving, setResolving] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.qty));
  const serials = () => props.plannedSerials ?? [];

  const commitPlanned = async (next: string[]) => {
    const capped = next.slice(0, targetQty());
    if (!props.onPopulateFromUnits) {
      props.onChange?.(capped);
      return;
    }
    // New tokens only — try resolve so a scan on an empty/mismatched line fills the item.
    const prev = new Set(serials().map((s) => s.toLowerCase()));
    const added = capped.filter((s) => !prev.has(s.toLowerCase()));
    if (added.length === 0) {
      props.onChange?.(capped);
      return;
    }
    setResolving(true);
    const { units, errors } = await resolveSerialBulk(added, { context: "purchase" });
    setResolving(false);
    if (units.length > 0) {
      await props.onPopulateFromUnits(units);
      // Keep any unresolved new tokens on the line if an item is already chosen.
      const unresolved = added.filter(
        (sn) => !units.some((u) => u.serial_no.toLowerCase() === sn.toLowerCase()),
      );
      if (unresolved.length > 0 && serials().length > 0) {
        props.onChange?.(dedupeSerials([...serials(), ...unresolved]).slice(0, targetQty()));
      }
      if (errors.length > 0) {
        toast.warning(errors.slice(0, 2).join(" · "));
      }
      return;
    }
    // No registry hit — treat as planned serials on the current line.
    props.onChange?.(capped);
    if (errors.length > 0 && !serials().length) {
      toast.warning(errors[0] ?? "Serial not registered — pick an item first, then enter the serial.");
    }
  };

  return (
    <>
      <InlineSerialBulkField
        serials={serials()}
        targetQty={targetQty()}
        disabled={props.disabled}
        busy={resolving()}
        placeholder="Scan serial — fills item if registered"
        onCommit={commitPlanned}
        onOpenAdvanced={() => setOpen(true)}
      />
      <PlannedSerialModal {...props} open={open()} onClose={() => setOpen(false)} />
    </>
  );
}

function UnitsSerialCell(props: UnitsProps) {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const [resolving, setResolving] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.qty));

  const labels = () =>
    (props.serialLabels ?? "")
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

  const commitResolved = async (serialNos: string[]) => {
    // Empty scan-first lines should accept a multi-serial paste and let the parent
    // create/fill rows; otherwise keep the qty cap for an already chosen item.
    const capped =
      props.onPopulateFromUnits && !props.itemId
        ? serialNos.filter(Boolean)
        : serialNos.slice(0, targetQty());
    if (capped.length === 0) {
      props.onChange([], "", undefined);
      return;
    }
    setResolving(true);
    // When populate-from-units is wired, resolve without pinning item_id so a
    // scan on an empty or wrong-item line can discover and fill the row.
    const pinItem = Boolean(props.itemId) && !props.onPopulateFromUnits;
    const { units, errors } = await resolveSerialBulk(capped, {
      locationId: props.locationId,
      itemId: pinItem ? props.itemId : undefined,
      context: props.context ?? "sale",
    });
    setResolving(false);
    if (errors.length > 0) {
      toast.warning(errors.slice(0, 3).join(" · ") + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ""));
    }
    if (units.length === 0) return;

    if (props.onPopulateFromUnits) {
      const lineEmpty = !props.itemId;
      const mismatched = units.some((u) => u.item_id !== props.itemId);
      if (lineEmpty || mismatched) {
        await props.onPopulateFromUnits(units);
        return;
      }
    }

    const { ids, labels: lbls, qty } = serialUnitsToChange(units);
    props.onChange(ids, lbls, qty);
  };

  return (
    <>
      <InlineSerialBulkField
        serials={labels()}
        targetQty={targetQty()}
        disabled={props.disabled}
        busy={resolving()}
        placeholder={
          props.itemId
            ? "Scan or type serials, comma-separated"
            : "Scan serial — auto-fills item line"
        }
        onCommit={commitResolved}
        onOpenAdvanced={props.itemId ? () => setOpen(true) : undefined}
      />
      <Show when={props.itemId}>
        <UnitsSerialModal {...props} open={open()} onClose={() => setOpen(false)} />
      </Show>
    </>
  );
}

function ReceiveSerialCell(props: ReceiveProps) {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const targetQty = () => Math.max(1, Math.floor(props.expectedQty));
  const serialNos = () => props.serials.map((s) => s.serial_no);
  const readOnly = () => props.status !== "draft";

  const scanQueue = useSerialScanQueue(() => props.grId);
  const appliedScanIds = new Set<string>();

  createEffect(() => {
    scanQueue.initFromStorage(props.grId);
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

  const appendReceiveSerials = async (incoming: string[]) => {
    if (readOnly() || props.disabled) return;
    const existing = new Set(props.serials.map((s) => s.serial_no.toLowerCase()));
    const toAdd = dedupeSerials(incoming).filter((sn) => !existing.has(sn.toLowerCase()));
    if (toAdd.length === 0) return;
    if (props.serials.length >= targetQty()) {
      toast.warning(`Line already has ${targetQty()} serial(s).`);
      return;
    }
    for (const sn of toAdd) {
      if (props.serials.length + scanQueue.pendingCount() >= targetQty()) break;
      scanQueue.enqueue(props.lineId, sn);
    }
    await scanQueue.flushNow();
  };

  return (
    <>
      <InlineSerialBulkField
        serials={serialNos()}
        targetQty={targetQty()}
        disabled={props.disabled}
        readOnly={readOnly()}
        busy={scanQueue.flushing()}
        placeholder="Scan serial, or paste comma-separated"
        onCommit={async (next) => {
          if (next.length < serialNos().length) {
            toast.warning("To remove serials, open ⋯ and use Remove last.");
            return;
          }
          await appendReceiveSerials(next);
        }}
        onOpenAdvanced={() => setOpen(true)}
      />
      <ReceiveSerialModal {...props} open={open()} onClose={() => setOpen(false)} />
    </>
  );
}

/** Fallback shown in the serial column when the line's item is not serial-tracked. */
export function SerialCellHint(props: { hasItem: boolean }) {
  return (
    <span
      class="cursor-help text-xs text-text-secondary"
      title={
        props.hasItem
          ? "This item is not serial-tracked. Enable “Track serial numbers” on the item in Inventory → Items to enter serials here."
          : "Pick an item first — serial entry appears for serial-tracked items."
      }
    >
      {props.hasItem ? "Not tracked" : "—"}
    </span>
  );
}

export function SerialLineCell(props: SerialLineCellProps) {
  return (
    <>
      <Show when={props.mode === "planned"}>
        <PlannedSerialCell {...(props as PlannedProps)} />
      </Show>
      <Show when={props.mode === "units"}>
        <UnitsSerialCell {...(props as UnitsProps)} />
      </Show>
      <Show when={props.mode === "receive"}>
        <ReceiveSerialCell {...(props as ReceiveProps)} />
      </Show>
    </>
  );
}
