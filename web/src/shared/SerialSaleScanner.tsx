import { createSignal, Show } from "solid-js";
import { apiFetch } from "./api";
import { inputClass } from "./SpreadsheetGrid";
import { useToast } from "./toast";

export type ResolvedSerialUnit = {
  serial_unit_id: number;
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  status: string;
  location_id?: number | null;
};

type Props = {
  itemId?: number | null;
  locationId?: number | null;
  serialUnitIds: number[];
  serialLabels?: string;
  context?: "sale" | "release" | "pos";
  disabled?: boolean;
  onChange: (unitIds: number[], labels: string, qty: string) => void;
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
  const [scanning, setScanning] = createSignal(false);

  const submit = async () => {
    const serialNo = scanInput().trim();
    if (!serialNo || scanning() || props.disabled) return;
    setScanning(true);
    const res = await apiFetch<ResolvedSerialUnit>(
      "/api/v1/inventory/serial-units/resolve-scan",
      {
        method: "POST",
        body: JSON.stringify({
          serial_no: serialNo,
          location_id: props.locationId ?? undefined,
          context: props.context ?? "sale",
        }),
      },
      { silent: true },
    );
    setScanning(false);
    setScanInput("");

    if (!res.success || !res.data) {
      beep("err");
      toast.warning(res.message ?? "Serial not available.");
      return;
    }
    const unit = res.data;
    if (props.itemId && unit.item_id !== props.itemId) {
      beep("err");
      toast.warning(`Serial belongs to ${unit.item_code}, not this line.`);
      return;
    }
    if (props.serialUnitIds.includes(unit.serial_unit_id)) {
      beep("err");
      toast.warning("Serial already on this line.");
      return;
    }
    const ids = [...props.serialUnitIds, unit.serial_unit_id];
    const labels = [...(props.serialLabels ?? "").split(/,\s*/).filter(Boolean), unit.serial_no].join(", ");
    beep("ok");
    props.onChange(ids, labels, String(ids.length));
  };

  return (
    <div class="space-y-1">
      <input
        class={inputClass}
        value={scanInput()}
        disabled={props.disabled || scanning()}
        placeholder="Scan serial…"
        onInput={(e) => setScanInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Show when={props.serialUnitIds.length > 0}>
        <p class="text-xs text-text-secondary">
          {props.serialUnitIds.length} serial(s): {props.serialLabels || "—"}
        </p>
      </Show>
    </div>
  );
}
