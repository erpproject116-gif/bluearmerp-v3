import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { DateInput } from "./DateInput";
import { Field, inputClass } from "./SpreadsheetGrid";
import { uiLabel } from "./branding/uiLabel";
import { useToast } from "./toast";

export type GrLotLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_lot?: boolean;
  expected_qty: number;
  received_qty: number;
  lots?: { id: number; lot_no: string; qty: number; expiry_date?: string | null }[];
};

type Props = {
  grId: number;
  lines: GrLotLine[];
  status: string;
  onRefresh: () => void | Promise<void>;
};

export function GrLotEntryPanel(props: Props) {
  const toast = useToast();
  const [lotLineId, setLotLineId] = createSignal<number | null>(null);
  const [lotNo, setLotNo] = createSignal("");
  const [lotQty, setLotQty] = createSignal("1");
  const [lotExpiry, setLotExpiry] = createSignal("");
  const [addingLot, setAddingLot] = createSignal(false);
  let lotNoInput: HTMLInputElement | undefined;

  const lotLines = () => props.lines.filter((l) => l.track_lot);
  const draft = () => props.status === "draft";

  // Preselect the first line that still needs quantity so a scanner can go
  // straight to the lot field without touching the line dropdown.
  createEffect(() => {
    const lines = lotLines();
    if (lotLineId() && lines.some((l) => l.id === lotLineId())) return;
    const next = lines.find((l) => l.received_qty < l.expected_qty) ?? lines[0];
    setLotLineId(next ? next.id : null);
  });

  const addLot = async () => {
    const lineId = lotLineId();
    const lot = lotNo().trim();
    const qty = Number(lotQty());
    if (!draft() || !lineId || !lot || !Number.isFinite(qty) || qty <= 0) {
      toast.warning("Select a line, enter lot no., and a positive quantity.");
      return;
    }
    setAddingLot(true);
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${props.grId}/lots`,
      {
        method: "POST",
        body: JSON.stringify({
          goods_receipt_line_id: lineId,
          lot_no: lot,
          qty,
          expiry_date: lotExpiry().trim() || null,
        }),
      },
      { silent: true },
    );
    setAddingLot(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to add lot.");
      lotNoInput?.focus();
      return;
    }
    setLotNo("");
    await props.onRefresh();
    toast.success(`Added lot ${lot}`);
    lotNoInput?.focus();
  };

  const onLotKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!addingLot()) void addLot();
  };

  return (
    <Show when={lotLines().length > 0}>
      <div class="mt-4 rounded-lg border border-stroke bg-slate-50 p-4">
        <h3 class="mb-3 text-sm font-semibold text-text-primary">{uiLabel("goods_receipt.lot_entry")}</h3>
        <Show when={draft()} fallback={<p class="text-sm text-text-secondary">{uiLabel("goods_receipt.draft_only_scans")}</p>}>
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Lot line">
              <select
                class={inputClass}
                value={lotLineId() ?? ""}
                onChange={(e) => setLotLineId(Number(e.currentTarget.value) || null)}
              >
                <option value="">Select line…</option>
                <For each={lotLines()}>
                  {(line) => (
                    <option value={line.id}>
                      {line.item_code} — {line.item_name} ({line.received_qty}/{line.expected_qty})
                    </option>
                  )}
                </For>
              </select>
            </Field>
            <Field label="Lot no.">
              <input
                ref={lotNoInput}
                class={inputClass}
                value={lotNo()}
                onInput={(e) => setLotNo(e.currentTarget.value)}
                onKeyDown={onLotKeyDown}
                placeholder="Scan or type lot no., Enter to add"
              />
            </Field>
            <Field label="Qty">
              <input
                type="number"
                class={inputClass}
                min="0.0001"
                step="any"
                value={lotQty()}
                onInput={(e) => setLotQty(e.currentTarget.value)}
                onKeyDown={onLotKeyDown}
              />
            </Field>
            <Field label="Expiry date">
              <DateInput value={lotExpiry()} onInput={(e) => setLotExpiry(e.currentTarget.value)} />
            </Field>
          </div>
          <div class="mt-3">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={!lotLineId() || !lotNo().trim() || addingLot()}
              onClick={() => void addLot()}
            >
              {addingLot() ? "Adding…" : "Add lot"}
            </button>
          </div>
        </Show>

        <div class="mt-4 overflow-x-auto rounded-lg border border-stroke bg-white">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-text-secondary">
              <tr>
                <th class="px-3 py-2">Line</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Expected</th>
                <th class="px-3 py-2">Received</th>
                <th class="px-3 py-2">Lots</th>
              </tr>
            </thead>
            <tbody>
              <For each={lotLines()}>
                {(line) => (
                  <tr class="border-t border-stroke">
                    <td class="px-3 py-2">{line.line_no}</td>
                    <td class="px-3 py-2">
                      {line.item_code} — {line.item_name}
                    </td>
                    <td class="px-3 py-2">{line.expected_qty}</td>
                    <td class="px-3 py-2">{line.received_qty}</td>
                    <td class="px-3 py-2 text-xs">
                      {(line.lots ?? []).length
                        ? (line.lots ?? []).map((l) => `${l.lot_no} (${l.qty})`).join(", ")
                        : "—"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </Show>
  );
}
