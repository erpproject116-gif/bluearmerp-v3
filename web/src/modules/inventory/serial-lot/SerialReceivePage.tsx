import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { useInvalidateSerialLotLists } from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";

type PurchaseOrderRow = {
  id: number;
  purchase_order_no: string;
  partner_name: string;
  location_id: number;
  location_name?: string;
  status: string;
  item_name_summary?: string;
};

type GoodsReceiptLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  track_serial: boolean;
  expected_qty: number;
  received_qty: number;
  serials?: { id: number; serial_no: string }[];
};

type GoodsReceipt = {
  id: number;
  purchase_order_id: number;
  purchase_order_no?: string;
  receipt_date: string;
  location_id: number;
  location_name?: string;
  status: string;
  lines?: GoodsReceiptLine[];
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchOpenPurchaseOrders(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "20",
    sort: "order_date",
    order: "desc",
    status: "confirmed",
  });
  if (q) qs.set("q", q);
  const res = await apiFetch<PurchaseOrderRow[]>(`/api/v1/purchase-order/purchase-orders?${qs}`);
  const confirmed = res.data ?? [];
  const qs2 = new URLSearchParams({
    page: "1",
    pageSize: "20",
    sort: "order_date",
    order: "desc",
    status: "partially_received",
  });
  if (q) qs2.set("q", q);
  const res2 = await apiFetch<PurchaseOrderRow[]>(`/api/v1/purchase-order/purchase-orders?${qs2}`);
  const partial = res2.data ?? [];
  const merged = [...confirmed, ...partial.filter((p) => !confirmed.some((c) => c.id === p.id))];
  return merged.map((po) => ({
    id: po.id,
    label: `${po.purchase_order_no} — ${po.partner_name}`,
    sublabel: po.item_name_summary,
  }));
}

export default function SerialReceivePage() {
  const toast = useToast();
  const invalidate = useInvalidateSerialLotLists();

  const [poLabel, setPoLabel] = createSignal("");
  const [selectedPoId, setSelectedPoId] = createSignal<number | null>(null);
  const [selectedPo, setSelectedPo] = createSignal<PurchaseOrderRow | null>(null);
  const [receiptDate, setReceiptDate] = createSignal(todayISO());
  const [goodsReceipt, setGoodsReceipt] = createSignal<GoodsReceipt | null>(null);
  const [scanLineId, setScanLineId] = createSignal<number | null>(null);
  const [scanInput, setScanInput] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [scanning, setScanning] = createSignal(false);
  const [posting, setPosting] = createSignal(false);

  const serialLines = () => (goodsReceipt()?.lines ?? []).filter((l) => l.track_serial);

  const loadPoDetails = async (poId: number) => {
    const res = await apiFetch<PurchaseOrderRow>(`/api/v1/purchase-order/purchase-orders/${poId}`);
    if (res.success && res.data) setSelectedPo(res.data);
  };

  const createReceipt = async () => {
    const po = selectedPo();
    if (!po) {
      toast.warning("Select a purchase order.");
      return;
    }
    setCreating(true);
    const res = await apiFetch<GoodsReceipt>(
      "/api/v1/goods-receipt/goods-receipts",
      {
        method: "POST",
        body: JSON.stringify({
          purchase_order_id: po.id,
          receipt_date: receiptDate(),
          location_id: po.location_id,
        }),
      },
      { silent: true },
    );
    setCreating(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to create goods receipt.");
      return;
    }
    setGoodsReceipt(res.data);
    const firstSerialLine = res.data.lines?.find((l) => l.track_serial);
    if (firstSerialLine) setScanLineId(firstSerialLine.id);
    toast.success("Goods receipt created. Scan serial numbers.");
  };

  const refreshReceipt = async (grId: number) => {
    const res = await apiFetch<GoodsReceipt>(`/api/v1/goods-receipt/goods-receipts/${grId}`);
    if (res.success && res.data) setGoodsReceipt(res.data);
  };

  const scanSerial = async () => {
    const gr = goodsReceipt();
    const lineId = scanLineId();
    const serialNo = scanInput().trim();
    if (!gr || !lineId || !serialNo) return;

    setScanning(true);
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${gr.id}/serials`,
      {
        method: "POST",
        body: JSON.stringify({
          goods_receipt_line_id: lineId,
          serial_no: serialNo,
        }),
      },
      { silent: true },
    );
    setScanning(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to scan serial.");
      return;
    }
    setScanInput("");
    await refreshReceipt(gr.id);
    toast.success(`Scanned ${serialNo}`);
  };

  const postReceipt = async () => {
    const gr = goodsReceipt();
    if (!gr) return;

    setPosting(true);
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${gr.id}/post`,
      { method: "POST" },
      { silent: true },
    );
    setPosting(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to post goods receipt.");
      return;
    }
    toast.success("Goods receipt posted.");
    invalidate();
    setGoodsReceipt(null);
    setSelectedPoId(null);
    setSelectedPo(null);
    setPoLabel("");
    setScanLineId(null);
  };

  const reset = () => {
    setGoodsReceipt(null);
    setSelectedPoId(null);
    setSelectedPo(null);
    setPoLabel("");
    setScanLineId(null);
    setScanInput("");
    setReceiptDate(todayISO());
  };

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Receive / Scan Serials</h2>
          <p class="text-sm text-text-secondary">
            Select a confirmed purchase order, create a goods receipt, scan serial numbers, then post.
          </p>
        </div>

        <Show
          when={!goodsReceipt()}
          fallback={
            <div class="space-y-4">
              <div class="rounded-lg border border-stroke bg-slate-50 p-4 text-sm">
                <p>
                  <span class="text-text-secondary">Goods receipt:</span>{" "}
                  <span class="font-medium">#{goodsReceipt()!.id}</span>
                  {" · "}
                  <span class="text-text-secondary">PO:</span>{" "}
                  <span class="font-medium">{goodsReceipt()!.purchase_order_no}</span>
                  {" · "}
                  <span class="text-text-secondary">Status:</span>{" "}
                  <span class="font-medium">{goodsReceipt()!.status}</span>
                </p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <Field label="Scan into line">
                  <select
                    class={inputClass}
                    value={scanLineId() ?? ""}
                    onChange={(e) => setScanLineId(Number(e.currentTarget.value) || null)}
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
                <Field label="Serial no.">
                  <div class="flex gap-2">
                    <input
                      class={inputClass}
                      value={scanInput()}
                      onInput={(e) => setScanInput(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void scanSerial();
                        }
                      }}
                      placeholder="Scan or type serial…"
                      disabled={!scanLineId() || scanning()}
                    />
                    <button
                      type="button"
                      class="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      disabled={!scanLineId() || !scanInput().trim() || scanning()}
                      onClick={() => void scanSerial()}
                    >
                      Add
                    </button>
                  </div>
                </Field>
              </div>

              <div class="overflow-x-auto rounded-lg border border-stroke">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-text-secondary">
                    <tr>
                      <th class="px-3 py-2">Line</th>
                      <th class="px-3 py-2">Item</th>
                      <th class="px-3 py-2">Expected</th>
                      <th class="px-3 py-2">Received</th>
                      <th class="px-3 py-2">Serials</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={serialLines()}>
                      {(line) => (
                        <tr class="border-t border-stroke">
                          <td class="px-3 py-2">{line.line_no}</td>
                          <td class="px-3 py-2">
                            {line.item_code} — {line.item_name}
                          </td>
                          <td class="px-3 py-2">{line.expected_qty}</td>
                          <td class="px-3 py-2">{line.received_qty}</td>
                          <td class="px-3 py-2">
                            {(line.serials ?? []).map((s) => s.serial_no).join(", ") || "—"}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

              <div class="flex flex-wrap gap-2 border-t border-stroke pt-4">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={posting() || goodsReceipt()!.status !== "draft"}
                  onClick={() => void postReceipt()}
                >
                  {posting() ? "Posting…" : "Post goods receipt"}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
                  onClick={reset}
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
          <div class="grid gap-4 md:grid-cols-2">
            <LookupCombo
              label="Purchase order"
              value={poLabel}
              selectedId={selectedPoId}
              onInput={setPoLabel}
              onSelect={(o) => {
                setSelectedPoId(o.id);
                setPoLabel(o.label);
                void loadPoDetails(o.id);
              }}
              onClear={() => {
                setSelectedPoId(null);
                setSelectedPo(null);
                setPoLabel("");
              }}
              fetchOptions={fetchOpenPurchaseOrders}
            />
            <Field label="Receipt date">
              <DateInput value={receiptDate()} onInput={(e) => setReceiptDate(e.currentTarget.value)} />
            </Field>
          </div>

          <Show when={selectedPo()}>
            {(po) => (
              <div class="mt-4 rounded-lg border border-stroke bg-slate-50 p-4 text-sm">
                <p>
                  <span class="text-text-secondary">Location:</span>{" "}
                  <span class="font-medium">{po().location_name ?? po().location_id}</span>
                  {" · "}
                  <span class="text-text-secondary">Partner:</span>{" "}
                  <span class="font-medium">{po().partner_name}</span>
                </p>
              </div>
            )}
          </Show>

          <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={!selectedPoId() || creating()}
              onClick={() => void createReceipt()}
            >
              {creating() ? "Creating…" : "Create goods receipt"}
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </Show>
      </section>
    </SerialLotLayout>
  );
}
