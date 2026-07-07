import { createEffect, createSignal, Show } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { ScannedSerialTable } from "./ScannedSerialTable";
import {
  serialUnitsToChange,
  unitsFromIdsAndLabels,
  type ResolvedSerialUnit,
} from "./serialScanTypes";
import { useSaleSerialScanQueue } from "./useSaleSerialScanQueue";
import { useToast } from "./toast";

export type { ResolvedSerialUnit } from "./serialScanTypes";

type Props = {
  itemId?: number | null;
  itemCode?: string;
  itemName?: string;
  locationId?: number | null;
  serialUnitIds: number[];
  serialLabels?: string;
  maxQty?: number;
  context?: "sale" | "release" | "pos";
  disabled?: boolean;
  onChange: (unitIds: number[], labels: string, qty: string) => void;
  onComplete?: () => void;
};

function beep(kind: "ok" | "err") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = kind === "ok" ? 880 : 220;
    gain.gain.value = 0.05;
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, kind === "ok" ? 80 : 150);
  } catch {
    // ignore
  }
}

export function SerialSaleScanner(props: Props) {
  const toast = useToast();
  const [scanInput, setScanInput] = createSignal("");
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [pasteText, setPasteText] = createSignal("");
  const [pasteBusy, setPasteBusy] = createSignal(false);
  const [units, setUnits] = createSignal<ResolvedSerialUnit[]>([]);
  const [rejectRows, setRejectRows] = createSignal<(ResolvedSerialUnit & { error: string })[]>([]);

  const targetQty = () => Math.max(1, Math.floor(props.maxQty ?? 1));

  const scanQueue = useSaleSerialScanQueue({
    locationId: () => props.locationId,
    itemId: () => props.itemId,
    context: () => props.context ?? "sale",
  });

  const syncParent = (next: ResolvedSerialUnit[]) => {
    const { ids, labels, qty } = serialUnitsToChange(next);
    props.onChange(ids, labels, qty);
    if (ids.length >= targetQty()) props.onComplete?.();
  };

  const applyAccepted = (accepted: ResolvedSerialUnit[]) => {
    if (accepted.length === 0) return;
    setUnits((prev) => {
      const seen = new Set(prev.map((u) => u.serial_unit_id));
      const next = [...prev];
      for (const u of accepted) {
        if (seen.has(u.serial_unit_id)) continue;
        if (next.length >= targetQty()) break;
        seen.add(u.serial_unit_id);
        next.push(u);
      }
      syncParent(next);
      return next;
    });
  };

  const processResults = (results: import("./serialScanTypes").ResolveScanBatchResult[]) => {
    const accepted: ResolvedSerialUnit[] = [];
    const rejected: (ResolvedSerialUnit & { error: string })[] = [];
    for (const r of results) {
      if (r.status === "accepted" && r.unit) {
        if (units().some((u) => u.serial_unit_id === r.unit!.serial_unit_id)) {
          rejected.push({
            ...r.unit,
            error: "Already on this line.",
          });
          beep("err");
          continue;
        }
        accepted.push(r.unit);
        beep("ok");
      } else {
        beep("err");
        const msg = r.message ?? r.status;
        toast.warning(`${r.serial_no}: ${msg}`);
        rejected.push({
          serial_unit_id: 0,
          serial_no: r.serial_no,
          item_id: r.unit?.item_id ?? 0,
          item_code: r.unit?.item_code ?? "—",
          item_name: r.unit?.item_name ?? "—",
          manufacturer: r.unit?.manufacturer,
          status: r.unit?.status ?? "rejected",
          error: msg,
        });
      }
    }
    if (rejected.length > 0) {
      setRejectRows((prev) => [...rejected, ...prev].slice(0, 20));
    }
    applyAccepted(accepted);
  };

  let processedResultCount = 0;
  createEffect(() => {
    const results = scanQueue.lastResults();
    if (results.length <= processedResultCount) return;
    const fresh = results.slice(processedResultCount);
    processedResultCount = results.length;
    processResults(fresh);
  });

  createEffect(() => {
    const ids = props.serialUnitIds;
    const labels = props.serialLabels ?? "";
    const current = units();
    const currentIds = current.map((u) => u.serial_unit_id).join(",");
    const propIds = ids.join(",");
    if (currentIds === propIds && current.length === ids.length) return;
    if (ids.length === 0) {
      setUnits([]);
      return;
    }
    setUnits(
      unitsFromIdsAndLabels(ids, labels, {
        item_id: props.itemId ?? undefined,
        item_code: props.itemCode,
        item_name: props.itemName,
      }),
    );
  });

  const submitScan = () => {
    const serialNo = scanInput().trim();
    if (!serialNo || props.disabled) return;
    if (units().length >= targetQty()) {
      toast.warning(`Line already has ${targetQty()} serial(s).`);
      return;
    }
    scanQueue.enqueue(serialNo);
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
      if (units().length + scanQueue.pendingCount() >= targetQty()) break;
      scanQueue.enqueue(sn);
    }
    await scanQueue.flushNow();
    setPasteBusy(false);
    setPasteText("");
    setPasteOpen(false);
    toast.success(`Processed ${lines.length} serial(s).`);
  };

  const removeUnit = (unitId: number) => {
    setUnits((prev) => {
      const next = prev.filter((u) => u.serial_unit_id !== unitId);
      syncParent(next);
      return next;
    });
  };

  const undoLast = () => {
    setUnits((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      syncParent(next);
      return next;
    });
  };

  const displayRows = () => [...rejectRows(), ...units()];

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <input
          class={`${inputClass} min-w-[12rem] flex-1`}
          value={scanInput()}
          disabled={props.disabled || scanQueue.flushing()}
          placeholder="Scan serial (Enter)…"
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
          disabled={props.disabled || units().length === 0}
          onClick={undoLast}
        >
          Undo last
        </button>
      </div>

      <Show when={scanQueue.pendingCount() > 0 || scanQueue.flushing()}>
        <p class="text-xs text-text-secondary">
          {scanQueue.flushing() ? "Flushing scans…" : `${scanQueue.pendingCount()} pending…`}
        </p>
      </Show>

      <ScannedSerialTable
        units={displayRows()}
        maxQty={targetQty()}
        disabled={props.disabled}
        onRemove={(id) => {
          if (id > 0) removeUnit(id);
        }}
      />

      <Show when={pasteOpen()}>
        <div class="rounded-lg border border-stroke bg-slate-50 p-3">
          <p class="mb-2 text-sm text-text-secondary">One serial number per line.</p>
          <textarea
            class={`${inputClass} mb-2 min-h-[100px] w-full font-mono text-sm`}
            value={pasteText()}
            disabled={pasteBusy()}
            placeholder="logitech001&#10;a4techj001"
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
    </div>
  );
}
