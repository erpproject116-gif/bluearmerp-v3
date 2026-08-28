import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { apiFetch } from "./api";
import { DateInput } from "./DateInput";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useToast } from "./toast";
import type { LotScanEnqueueInput } from "./useLotScanQueue";

const SCAN_AUTO_COMMIT_MS = 180;

export type LotScanContextLine = {
  line_id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_serial: boolean;
  expected_qty: number;
  received_qty: number;
  is_open: boolean;
};

export type LotReceiveLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_lot: boolean;
  catch_weight?: boolean;
  expected_qty: number;
  received_qty: number;
  lots?: { id: number; lot_no: string; qty: number; expiry_date?: string | null }[];
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

export function LotWeightScanner(props: {
  grId: number;
  lines: LotReceiveLine[];
  status: string;
  catchWeightMode?: boolean;
  onEnqueue: (input: LotScanEnqueueInput) => string | null;
  onAfterScan?: () => void;
  showLinePicker?: boolean;
}) {
  const toast = useToast();
  const [activeLineId, setActiveLineId] = createSignal<number | null>(null);
  const [lotInput, setLotInput] = createSignal("");
  const [qtyInput, setQtyInput] = createSignal("1");
  const [expiryInput, setExpiryInput] = createSignal("");
  const [scanning, setScanning] = createSignal(false);
  const [contextLines, setContextLines] = createSignal<LotScanContextLine[]>([]);
  let lotInputRef: HTMLInputElement | undefined;

  const lotLines = () => props.lines.filter((l) => l.track_lot);
  const catchWeight = () => props.catchWeightMode ?? lotLines().some((l) => l.catch_weight);

  const activeLine = (): LotReceiveLine | LotScanContextLine | undefined => {
    const id = activeLineId();
    return lotLines().find((l) => l.id === id) ?? contextLines().find((l) => l.line_id === id);
  };

  const activeLineCounts = () => {
    const ln = activeLine();
    if (!ln) return "";
    return `${ln.received_qty} / ${ln.expected_qty}`;
  };

  const loadContext = async () => {
    const qs = activeLineId() ? `?active_line_id=${activeLineId()}` : "";
    const res = await apiFetch<{
      lines: LotScanContextLine[];
      active_line_id?: number;
    }>(`/api/v1/goods-receipt/goods-receipts/${props.grId}/scan-context${qs}`, undefined, { silent: true });
    if (res.success && res.data) {
      setContextLines(res.data.lines ?? []);
      if (res.data.active_line_id) setActiveLineId(res.data.active_line_id);
    }
  };

  createEffect(() => {
    if (props.grId) void loadContext();
  });

  createEffect(() => {
    const lines = lotLines();
    if (activeLineId() && lines.some((l) => l.id === activeLineId())) return;
    const next = lines.find((l) => l.received_qty < l.expected_qty) ?? lines[0];
    setActiveLineId(next ? next.id : null);
  });

  let autoCommitTimer: ReturnType<typeof setTimeout> | undefined;

  const clearAutoCommit = () => {
    if (autoCommitTimer != null) {
      clearTimeout(autoCommitTimer);
      autoCommitTimer = undefined;
    }
  };

  onCleanup(() => clearAutoCommit());

  const submitLot = () => {
    const lotNo = lotInput().trim();
    const lineId = activeLineId();
    if (!lotNo || !lineId || props.status !== "draft" || scanning()) return;

    const qty = Number(qtyInput());
    if (!Number.isFinite(qty) || qty <= 0) {
      beep("err");
      toast.warning(catchWeight() ? "Enter a positive gross weight (kg)." : "Enter a positive quantity.");
      return;
    }

    clearAutoCommit();
    setScanning(true);

    const payload: LotScanEnqueueInput = {
      lineId,
      lotNo,
      qty,
      expiryDate: expiryInput().trim() || null,
      grossWeightKg: catchWeight() ? qty : null,
    };

    const clientId = props.onEnqueue(payload);
    setScanning(false);
    setLotInput("");
    if (!catchWeight()) setQtyInput("1");
    lotInputRef?.focus();

    if (clientId) {
      beep("ok");
      props.onAfterScan?.();
      void loadContext();
    } else {
      beep("err");
      toast.warning("Could not queue lot — check line and values.");
    }
  };

  const selectLineByScan = async (value: string) => {
    const code = value.trim().toUpperCase();
    const matches = lotLines().filter((l) => l.item_code.toUpperCase() === code);
    if (matches.length === 1) {
      setActiveLineId(matches[0].id);
      beep("ok");
      toast.success(`Line ${matches[0].line_no}: ${matches[0].item_code}`);
      setLotInput("");
      lotInputRef?.focus();
      void loadContext();
      return true;
    }
    if (matches.length > 1) {
      beep("err");
      toast.warning("Multiple lot lines match — pick a line.");
      return true;
    }
    return false;
  };

  const handleScanInput = async (raw: string) => {
    if (props.status !== "draft" || scanning()) return;
    const value = raw.trim();
    if (!value) return;

    if (!activeLineId()) {
      const handled = await selectLineByScan(value);
      if (handled) return;
    }

    clearAutoCommit();
    autoCommitTimer = setTimeout(() => {
      autoCommitTimer = undefined;
      if (lotInput().trim() === value) void submitLot();
    }, SCAN_AUTO_COMMIT_MS);
  };

  return (
    <div class="space-y-3 rounded-lg border border-stroke bg-slate-50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">
          {catchWeight() ? "Lot / catch-weight scanner" : "Lot batch scanner"}
        </h3>
        <Show when={activeLine()}>
          <span class="text-xs text-text-secondary">
            Active:{" "}
            <span class="font-medium text-text-primary">
              {"line_id" in (activeLine() ?? {})
                ? (activeLine() as LotScanContextLine).item_code
                : (activeLine() as LotReceiveLine).item_code}
            </span>
            {" · "}
            {activeLineCounts()}
          </span>
        </Show>
      </div>

      <p class="text-xs text-text-secondary">
        Scan <strong>item code</strong> to select a line, then scan or type each <strong>lot number</strong>
        {catchWeight() ? (
          <> with <strong>gross weight (kg)</strong></>
        ) : (
          <> with <strong>quantity</strong></>
        )}
        {" "}— adds automatically after a short pause (Enter still works).
      </p>

      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Lot no. / item scan">
          <input
            ref={lotInputRef}
            class={inputClass}
            value={lotInput()}
            disabled={props.status !== "draft" || scanning()}
            placeholder={catchWeight() ? "Scan item or lot label" : "Scan item or lot no."}
            autofocus
            onInput={(e) => {
              const v = e.currentTarget.value;
              setLotInput(v);
              void handleScanInput(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                clearAutoCommit();
                void submitLot();
              }
            }}
          />
        </Field>
        <Field label={catchWeight() ? "Gross weight (kg)" : "Qty per lot"}>
          <input
            type="number"
            class={inputClass}
            min="0.0001"
            step="any"
            value={qtyInput()}
            disabled={props.status !== "draft" || scanning()}
            onInput={(e) => setQtyInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                clearAutoCommit();
                void submitLot();
              }
            }}
          />
        </Field>
        <Field label="Expiry date (optional)">
          <DateInput
            value={expiryInput()}
            disabled={props.status !== "draft" || scanning()}
            onInput={(e) => setExpiryInput(e.currentTarget.value)}
          />
        </Field>
      </div>

      <Show when={props.showLinePicker !== false && lotLines().length > 1}>
        <Field label="Active line (fallback)">
          <select
            class={inputClass}
            value={activeLineId() ?? ""}
            onChange={(e) => setActiveLineId(Number(e.currentTarget.value) || null)}
          >
            <option value="">Select line…</option>
            <For each={lotLines()}>
              {(line) => (
                <option value={line.id}>
                  {line.item_code} — {line.item_name} ({line.received_qty}/{line.expected_qty})
                  {line.catch_weight ? " · catch-weight" : ""}
                </option>
              )}
            </For>
          </select>
        </Field>
      </Show>
    </div>
  );
}
