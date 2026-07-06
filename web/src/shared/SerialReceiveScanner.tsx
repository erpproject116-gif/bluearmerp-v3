import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { Field, inputClass } from "./SpreadsheetGrid";
import { useToast } from "./toast";

export type ScanContextLine = {
  line_id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_serial: boolean;
  expected_qty: number;
  received_qty: number;
  serial_count: number;
  is_open: boolean;
};

export type UnifiedScanResult = {
  client_scan_id?: string;
  serial_no: string;
  status: string;
  serial_id?: number;
  message?: string;
};

export type UnifiedScanResponse = {
  mode: string;
  active_line_id?: number;
  item_code?: string;
  line_no?: number;
  result?: UnifiedScanResult;
  message?: string;
  candidates?: ScanContextLine[];
};

export type SerialReceiveLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_serial: boolean;
  expected_qty: number;
  received_qty: number;
  serials?: { id: number; serial_no: string }[];
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

function patchLineFromScan(line: SerialReceiveLine, result: UnifiedScanResult): SerialReceiveLine {
  if (!result.serial_id || (result.status !== "accepted" && result.status !== "idempotent_replay")) {
    return line;
  }
  const serials = line.serials ?? [];
  if (serials.some((s) => s.serial_no === result.serial_no)) return line;
  return {
    ...line,
    received_qty: Math.min(line.expected_qty, line.received_qty + 1),
    serials: [...serials, { id: result.serial_id, serial_no: result.serial_no }],
  };
}

export function SerialReceiveScanner(props: {
  grId: number;
  lines: SerialReceiveLine[];
  status: string;
  onLinesUpdate: (lines: SerialReceiveLine[]) => void;
  onAfterScan?: () => void;
  showLinePicker?: boolean;
}) {
  const toast = useToast();
  const [activeLineId, setActiveLineId] = createSignal<number | null>(null);
  const [scanInput, setScanInput] = createSignal("");
  const [scanning, setScanning] = createSignal(false);
  const [contextLines, setContextLines] = createSignal<ScanContextLine[]>([]);
  let inputRef: HTMLInputElement | undefined;

  const serialLines = () => props.lines.filter((l) => l.track_serial);
  const activeLine = (): ScanContextLine | SerialReceiveLine | undefined => {
    const id = activeLineId();
    return serialLines().find((l) => l.id === id) ?? contextLines().find((l) => l.line_id === id);
  };

  const activeLineCounts = () => {
    const ln = activeLine();
    if (!ln) return "";
    if ("line_id" in ln) return `${ln.received_qty} / ${ln.expected_qty}`;
    return `${ln.received_qty} / ${ln.expected_qty}`;
  };

  const loadContext = async () => {
    const qs = activeLineId() ? `?active_line_id=${activeLineId()}` : "";
    const res = await apiFetch<{
      lines: ScanContextLine[];
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

  const submitScan = async () => {
    const value = scanInput().trim();
    if (!value || props.status !== "draft" || scanning()) return;

    setScanning(true);
    const res = await apiFetch<UnifiedScanResponse>(
      `/api/v1/goods-receipt/goods-receipts/${props.grId}/scan`,
      {
        method: "POST",
        body: JSON.stringify({
          scan: value,
          active_line_id: activeLineId() ?? undefined,
        }),
      },
      { silent: true },
    );
    setScanning(false);
    setScanInput("");
    inputRef?.focus();

    if (!res.success || !res.data) {
      beep("err");
      toast.warning(res.message ?? "Scan failed.");
      return;
    }

    const data = res.data;
    if (data.mode === "line_selected" && data.active_line_id) {
      setActiveLineId(data.active_line_id);
      beep("ok");
      toast.success(`Line ${data.line_no ?? ""}: ${data.item_code ?? "selected"}`);
      void loadContext();
      return;
    }
    if (data.mode === "ambiguous_line") {
      beep("err");
      toast.warning(data.message ?? "Multiple lines match — pick a line.");
      return;
    }
    if (data.mode === "need_active_line") {
      beep("err");
      toast.warning(data.message ?? "Scan item code first.");
      return;
    }
    if (data.mode === "serial_scan" && data.result) {
      const r = data.result;
      if (r.status === "accepted" || r.status === "idempotent_replay") {
        beep("ok");
        const next = props.lines.map((line) =>
          line.id === activeLineId() ? patchLineFromScan(line, r) : line,
        );
        props.onLinesUpdate(next);
        props.onAfterScan?.();
        void loadContext();
      } else {
        beep("err");
        toast.warning(r.message ?? `${r.status}: ${r.serial_no}`);
      }
    }
  };

  return (
    <div class="space-y-3 rounded-lg border border-stroke bg-slate-50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">Barcode scanner</h3>
        <Show when={activeLine()}>
          <span class="text-xs text-text-secondary">
            Active:{" "}
            <span class="font-medium text-text-primary">
              {"line_id" in (activeLine() ?? {}) ? (activeLine() as ScanContextLine).item_code : (activeLine() as SerialReceiveLine).item_code}
            </span>
            {" · "}
            {activeLineCounts()}
          </span>
        </Show>
      </div>

      <p class="text-xs text-text-secondary">
        Scan <strong>item code</strong> to select a line, then scan each <strong>serial number</strong>.
      </p>

      <Field label="Scan">
        <input
          ref={inputRef}
          class={inputClass}
          value={scanInput()}
          disabled={props.status !== "draft" || scanning()}
          placeholder="Item code or serial…"
          autofocus
          onInput={(e) => setScanInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitScan();
            }
          }}
        />
      </Field>

      <Show when={props.showLinePicker !== false && serialLines().length > 1}>
        <Field label="Active line (fallback)">
          <select
            class={inputClass}
            value={activeLineId() ?? ""}
            onChange={(e) => setActiveLineId(Number(e.currentTarget.value) || null)}
          >
            <option value="">Select line…</option>
            <For each={serialLines()}>
              {(line) => (
                <option value={line.id}>
                  {line.item_code} — {line.item_name} ({line.received_qty}/{line.expected_qty})
                </option>
              )}
            </For>
          </select>
        </Field>
      </Show>
    </div>
  );
}
