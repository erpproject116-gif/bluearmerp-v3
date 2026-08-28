import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { useInvalidateSerialLotLists } from "../../../shared/useSerialLotList";
import { takeSerialLotSeed } from "../../../shared/docSeed";
import {
  patchGoodsReceiptLines,
  useSerialScanQueue,
  type BatchScanResult,
  type QueuedScan,
} from "../../../shared/useSerialScanQueue";
import {
  patchGoodsReceiptLotLines,
  useLotScanQueue,
  type BatchLotScanResult,
  type QueuedLotScan,
} from "../../../shared/useLotScanQueue";
import { SerialReceiveScanner } from "../../../shared/SerialReceiveScanner";
import { LotWeightScanner } from "../../../shared/LotWeightScanner";
import { parseAndDedupeSerialBulkInput } from "../../../shared/serialBulkParse";
import { parseAndDedupeLotBulkInput } from "../../../shared/lotBulkParse";
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

type GoodsReceiptLot = {
  id: number;
  lot_no: string;
  qty: number;
  expiry_date?: string | null;
};

type GoodsReceiptLine = {
  id: number;
  line_no: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  track_serial: boolean;
  track_lot: boolean;
  catch_weight?: boolean;
  expected_qty: number;
  received_qty: number;
  serials?: { id: number; serial_no: string }[];
  lots?: GoodsReceiptLot[];
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

type ReceiveMode = "serial" | "lot" | "catch_weight" | "none";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function modeLabel(mode: ReceiveMode): string {
  switch (mode) {
    case "serial":
      return "Serial scan";
    case "lot":
      return "Lot / batch";
    case "catch_weight":
      return "Catch-weight";
    default:
      return "No tracked lines";
  }
}

function detectLineMode(line: GoodsReceiptLine | undefined): ReceiveMode {
  if (!line) return "none";
  if (line.track_serial) return "serial";
  if (line.track_lot && line.catch_weight) return "catch_weight";
  if (line.track_lot) return "lot";
  return "none";
}

function detectDocumentMode(lines: GoodsReceiptLine[]): ReceiveMode {
  const serial = lines.filter((l) => l.track_serial);
  const lot = lines.filter((l) => l.track_lot && !l.track_serial);
  const catchW = lot.filter((l) => l.catch_weight);
  if (serial.length > 0 && lot.length === 0) return "serial";
  if (catchW.length > 0 && serial.length === 0) return "catch_weight";
  if (lot.length > 0 && serial.length === 0) return "lot";
  if (serial.length > 0) return "serial";
  if (catchW.length > 0) return "catch_weight";
  if (lot.length > 0) return "lot";
  return "none";
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

async function enrichLinesWithCatchWeight(lines: GoodsReceiptLine[]): Promise<GoodsReceiptLine[]> {
  const itemIds = [...new Set(lines.map((l) => l.item_id).filter((id): id is number => !!id))];
  if (itemIds.length === 0) return lines;
  const catchByItem = new Map<number, boolean>();
  await Promise.all(
    itemIds.map(async (id) => {
      const res = await apiFetch<{ catch_weight?: boolean }>(`/api/v1/inventory/items/${id}`, undefined, {
        silent: true,
      });
      if (res.success && res.data) catchByItem.set(id, Boolean(res.data.catch_weight));
    }),
  );
  return lines.map((l) => ({
    ...l,
    catch_weight: l.item_id ? catchByItem.get(l.item_id) ?? false : false,
  }));
}

export default function ReceiveStationPage() {
  const toast = useToast();
  const invalidate = useInvalidateSerialLotLists();
  const [params] = useSearchParams();

  const [poLabel, setPoLabel] = createSignal("");
  const [selectedPoId, setSelectedPoId] = createSignal<number | null>(null);
  const [selectedPo, setSelectedPo] = createSignal<PurchaseOrderRow | null>(null);
  const [receiptDate, setReceiptDate] = createSignal(todayISO());
  const [goodsReceipt, setGoodsReceipt] = createSignal<GoodsReceipt | null>(null);
  const [activeLineId, setActiveLineId] = createSignal<number | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [posting, setPosting] = createSignal(false);
  const [serialPasteOpen, setSerialPasteOpen] = createSignal(false);
  const [lotPasteOpen, setLotPasteOpen] = createSignal(false);
  const [serialPasteText, setSerialPasteText] = createSignal("");
  const [lotPasteText, setLotPasteText] = createSignal("");
  const [pasteBusy, setPasteBusy] = createSignal(false);

  const appliedSerialScanIds = new Set<string>();
  const appliedLotScanIds = new Set<string>();
  const serialQueue = useSerialScanQueue(() => goodsReceipt()?.id ?? null);
  const lotQueue = useLotScanQueue(() => goodsReceipt()?.id ?? null);

  const lines = () => goodsReceipt()?.lines ?? [];
  const serialLines = () => lines().filter((l) => l.track_serial);
  const lotLines = () => lines().filter((l) => l.track_lot && !l.track_serial);
  const activeLine = () => lines().find((l) => l.id === activeLineId());

  const documentMode = createMemo(() => detectDocumentMode(lines()));
  const activeMode = createMemo(() => detectLineMode(activeLine()));

  const serialPostBlocked = createMemo(() => {
    const sl = serialLines();
    if (sl.length === 0) return false;
    return sl.some((l) => Math.abs(l.received_qty - (l.serials?.length ?? 0)) > 0.0001);
  });

  const canPostPartial = createMemo(() => {
    const gr = goodsReceipt();
    if (!gr || gr.status !== "draft") return false;
    const anyReceived = lines().some((l) => l.received_qty > 0.0001);
    if (!anyReceived) return false;
    if (serialPostBlocked()) return false;
    return true;
  });

  const isPartialReceive = createMemo(() =>
    lines().some((l) => l.received_qty > 0.0001 && l.received_qty + 0.0001 < l.expected_qty),
  );

  const setReceiptWithLines = async (gr: GoodsReceipt) => {
    const enriched = gr.lines ? await enrichLinesWithCatchWeight(gr.lines) : [];
    setGoodsReceipt({ ...gr, lines: enriched });
    const first =
      enriched.find((l) => l.track_serial) ??
      enriched.find((l) => l.track_lot) ??
      enriched[0];
    if (first) setActiveLineId(first.id);
  };

  const applySerialFlush = (queueSlice: QueuedScan[], results: BatchScanResult[]) => {
    const fresh = queueSlice.filter((q) => !appliedSerialScanIds.has(q.client_scan_id));
    if (fresh.length === 0) return;
    for (const q of fresh) {
      const r = results.find((x) => x.client_scan_id === q.client_scan_id);
      if (r && (r.status === "accepted" || r.status === "idempotent_replay")) {
        appliedSerialScanIds.add(q.client_scan_id);
      }
    }
    setGoodsReceipt((gr) => {
      if (!gr?.lines) return gr;
      return { ...gr, lines: patchGoodsReceiptLines(gr.lines, fresh, results) };
    });
  };

  const applyLotFlush = (queueSlice: QueuedLotScan[], results: BatchLotScanResult[]) => {
    const fresh = queueSlice.filter((q) => !appliedLotScanIds.has(q.client_scan_id));
    if (fresh.length === 0) return;
    for (const q of fresh) {
      const r = results.find((x) => x.client_scan_id === q.client_scan_id);
      if (r && (r.status === "accepted" || r.status === "idempotent_replay")) {
        appliedLotScanIds.add(q.client_scan_id);
      }
    }
    setGoodsReceipt((gr) => {
      if (!gr?.lines) return gr;
      return { ...gr, lines: patchGoodsReceiptLotLines(gr.lines, fresh, results) };
    });
  };

  createEffect(() => {
    const q = serialQueue.queue();
    const gr = goodsReceipt();
    if (!gr) return;
    const done = q.filter(
      (item) =>
        (item.status === "accepted" || item.status === "replay") && !appliedSerialScanIds.has(item.client_scan_id),
    );
    if (done.length === 0) return;
    const results: BatchScanResult[] = done.map((item) => ({
      client_scan_id: item.client_scan_id,
      serial_no: item.serial_no,
      status: item.status === "replay" ? "idempotent_replay" : "accepted",
      serial_id: item.serial_id,
    }));
    applySerialFlush(done, results);
  });

  createEffect(() => {
    const q = lotQueue.queue();
    const gr = goodsReceipt();
    if (!gr) return;
    const done = q.filter(
      (item) =>
        (item.status === "accepted" || item.status === "replay") && !appliedLotScanIds.has(item.client_scan_id),
    );
    if (done.length === 0) return;
    const results: BatchLotScanResult[] = done.map((item) => ({
      client_scan_id: item.client_scan_id,
      lot_no: item.lot_no,
      qty: item.qty,
      status: item.status === "replay" ? "idempotent_replay" : "accepted",
      lot_id: item.lot_id,
    }));
    applyLotFlush(done, results);
  });

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
    if (!po.location_id || po.location_id <= 0) {
      toast.warning("This purchase order has no receive location.");
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
    appliedSerialScanIds.clear();
    appliedLotScanIds.clear();
    serialQueue.resetQueue();
    lotQueue.resetQueue();
    await setReceiptWithLines(res.data);
    serialQueue.initFromStorage(res.data.id);
    lotQueue.initFromStorage(res.data.id);
    toast.success("Receive station ready — scan serials or enter lots.");
  };

  const importPastedSerials = async () => {
    const gr = goodsReceipt();
    const lineId = activeLineId();
    if (!gr || !lineId) {
      toast.warning("Select an active line first.");
      return;
    }
    const sns = parseAndDedupeSerialBulkInput(serialPasteText());
    if (sns.length === 0) {
      toast.warning("Paste at least one serial.");
      return;
    }
    setPasteBusy(true);
    for (const sn of sns) serialQueue.enqueue(lineId, sn);
    await serialQueue.flushNow();
    setPasteBusy(false);
    setSerialPasteText("");
    setSerialPasteOpen(false);
    toast.success(`Queued ${sns.length} serial(s).`);
  };

  const importPastedLots = async () => {
    const gr = goodsReceipt();
    const lineId = activeLineId();
    if (!gr || !lineId) {
      toast.warning("Select an active line first.");
      return;
    }
    const rows = parseAndDedupeLotBulkInput(lotPasteText());
    if (rows.length === 0) {
      toast.warning("Paste lot rows (lot no., qty, optional expiry).");
      return;
    }
    setPasteBusy(true);
    for (const row of rows) {
      lotQueue.enqueue({
        lineId,
        lotNo: row.lot_no,
        qty: row.qty,
        expiryDate: row.expiry_date,
        grossWeightKg: activeLine()?.catch_weight ? row.qty : null,
      });
    }
    await lotQueue.flushNow();
    setPasteBusy(false);
    setLotPasteText("");
    setLotPasteOpen(false);
    toast.success(`Queued ${rows.length} lot(s).`);
  };

  const postReceipt = async () => {
    const gr = goodsReceipt();
    if (!gr) return;
    if (serialPostBlocked()) {
      toast.warning("Serial lines need matching scan counts before posting.");
      return;
    }
    if (!canPostPartial()) {
      toast.warning("Receive at least one unit before posting.");
      return;
    }
    await serialQueue.flushNow();
    await lotQueue.flushNow();
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
    toast.success(isPartialReceive() ? "Partial receive posted." : "Goods receipt posted.");
    invalidate();
    reset();
  };

  const reset = () => {
    appliedSerialScanIds.clear();
    appliedLotScanIds.clear();
    serialQueue.resetQueue();
    lotQueue.resetQueue();
    setGoodsReceipt(null);
    setSelectedPoId(null);
    setSelectedPo(null);
    setPoLabel("");
    setActiveLineId(null);
    setReceiptDate(todayISO());
    setSerialPasteOpen(false);
    setLotPasteOpen(false);
    setSerialPasteText("");
    setLotPasteText("");
  };

  createEffect(() => {
    const grId = Number(params.gr_id);
    if (goodsReceipt() || !grId || grId <= 0) return;
    void (async () => {
      const res = await apiFetch<GoodsReceipt>(`/api/v1/goods-receipt/goods-receipts/${grId}`);
      if (res.success && res.data?.status === "draft") {
        await setReceiptWithLines(res.data);
        serialQueue.initFromStorage(res.data.id);
        lotQueue.initFromStorage(res.data.id);
      }
    })();
  });

  onMount(() => {
    const seed = takeSerialLotSeed();
    if (seed?.rows?.length) {
      const serials = seed.rows
        .map((row) => row.serial?.trim())
        .filter((s): s is string => !!s);
      if (serials.length > 0) {
        setSerialPasteText(serials.join("\n"));
        setSerialPasteOpen(true);
        toast.success(
          `Baiko staged ${serials.length} serial(s) from ${seed.file_name || "your attachment"}. ` +
            "Create or select a goods receipt, pick the scan line, then Import to confirm.",
        );
      }
      const lotRows = seed.rows.filter((row) => row.lot?.trim());
      if (lotRows.length > 0) {
        setLotPasteText(
          lotRows
            .map((row) => {
              const lot = row.lot?.trim() ?? "";
              const qty = row.qty != null && row.qty > 0 ? String(row.qty) : "1";
              return `${lot}, ${qty}`;
            })
            .join("\n"),
        );
        setLotPasteOpen(true);
      }
    }
    const gr = goodsReceipt();
    if (gr) {
      serialQueue.initFromStorage(gr.id);
      lotQueue.initFromStorage(gr.id);
    }
  });

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Receive station</h2>
            <p class="text-sm text-text-secondary">
              Unified receive for serial, lot, and catch-weight lines. Mode switches from item tracking settings.
            </p>
          </div>
          <A href="/app/inventory/serial-lot/receive" class="text-xs text-brand-600 hover:underline">
            Legacy receive
          </A>
        </div>

        <Show
          when={!goodsReceipt()}
          fallback={
            <div class="space-y-4">
              <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>
                    <span class="text-text-secondary">GR:</span>{" "}
                    <span class="font-medium">#{goodsReceipt()!.id}</span>
                  </span>
                  <span>
                    <span class="text-text-secondary">PO:</span>{" "}
                    <span class="font-medium">{goodsReceipt()!.purchase_order_no}</span>
                  </span>
                  <span>
                    <span class="text-text-secondary">Location:</span>{" "}
                    <span class="font-medium">{goodsReceipt()!.location_name ?? goodsReceipt()!.location_id}</span>
                  </span>
                  <span>
                    <span class="text-text-secondary">Status:</span>{" "}
                    <span class="font-medium capitalize">{goodsReceipt()!.status}</span>
                  </span>
                  <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
                    {modeLabel(documentMode())}
                  </span>
                  <Show when={activeLine()}>
                    <span class="text-xs text-text-secondary">
                      Active line {activeLine()!.line_no}: {activeLine()!.item_code} · {modeLabel(activeMode())}
                    </span>
                  </Show>
                  <Show when={serialQueue.pendingCount() > 0 || lotQueue.pendingCount() > 0}>
                    <span class="text-xs font-medium text-amber-700">
                      {serialQueue.pendingCount() + lotQueue.pendingCount()} pending sync
                    </span>
                  </Show>
                </div>
              </div>

              <div class="overflow-x-auto rounded-lg border border-stroke">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-text-secondary">
                    <tr>
                      <th class="px-3 py-2">Line</th>
                      <th class="px-3 py-2">Item</th>
                      <th class="px-3 py-2">Mode</th>
                      <th class="px-3 py-2">Expected</th>
                      <th class="px-3 py-2">Received</th>
                      <th class="px-3 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={lines()}>
                      {(line) => {
                        const mode = () => detectLineMode(line);
                        const isActive = () => line.id === activeLineId();
                        return (
                          <tr
                            class={`cursor-pointer border-t border-stroke ${isActive() ? "bg-brand-50/60" : ""}`}
                            onClick={() => setActiveLineId(line.id)}
                          >
                            <td class="px-3 py-2">{line.line_no}</td>
                            <td class="px-3 py-2">
                              {line.item_code} — {line.item_name}
                            </td>
                            <td class="px-3 py-2 text-xs">{modeLabel(mode())}</td>
                            <td class="px-3 py-2">{line.expected_qty}</td>
                            <td class="px-3 py-2">{line.received_qty}</td>
                            <td class="px-3 py-2 text-xs text-text-secondary">
                              <Show when={line.track_serial}>
                                {(line.serials ?? []).length} serial(s)
                              </Show>
                              <Show when={line.track_lot && !line.track_serial}>
                                {(line.lots ?? [])
                                  .map((l) =>
                                    `${l.lot_no} (${l.qty}${l.expiry_date ? ` exp ${l.expiry_date.slice(0, 10)}` : ""})`,
                                  )
                                  .join("; ") || "—"}
                              </Show>
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>

              <Show when={serialLines().length > 0}>
                <SerialReceiveScanner
                  grId={goodsReceipt()!.id}
                  lines={lines()}
                  status={goodsReceipt()!.status}
                  onLinesUpdate={(next) => {
                    setGoodsReceipt((gr) => (gr ? { ...gr, lines: next as GoodsReceiptLine[] } : gr));
                  }}
                />
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                    onClick={() => setSerialPasteOpen((v) => !v)}
                  >
                    {serialPasteOpen() ? "Hide serial paste" : "Paste serials"}
                  </button>
                </div>
                <Show when={serialPasteOpen()}>
                  <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                    <Field label="One serial per line">
                      <textarea
                        class={`${inputClass} min-h-[100px] font-mono text-sm`}
                        value={serialPasteText()}
                        onInput={(e) => setSerialPasteText(e.currentTarget.value)}
                      />
                    </Field>
                    <button
                      type="button"
                      class="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      disabled={pasteBusy()}
                      onClick={() => void importPastedSerials()}
                    >
                      Import serials
                    </button>
                  </div>
                </Show>
              </Show>

              <Show when={lotLines().length > 0}>
                <LotWeightScanner
                  grId={goodsReceipt()!.id}
                  lines={lotLines()}
                  status={goodsReceipt()!.status}
                  catchWeightMode={documentMode() === "catch_weight" || Boolean(activeLine()?.catch_weight)}
                  onEnqueue={(input) => lotQueue.enqueue(input)}
                />
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                    onClick={() => setLotPasteOpen((v) => !v)}
                  >
                    {lotPasteOpen() ? "Hide lot paste" : "Paste lots"}
                  </button>
                </div>
                <Show when={lotPasteOpen()}>
                  <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                    <Field label="lot_no · qty · expiry (one per line)">
                      <textarea
                        class={`${inputClass} min-h-[100px] font-mono text-sm`}
                        value={lotPasteText()}
                        placeholder={"LOT-A\t10\t2026-12-31\nLOT-B\t5"}
                        onInput={(e) => setLotPasteText(e.currentTarget.value)}
                      />
                    </Field>
                    <button
                      type="button"
                      class="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      disabled={pasteBusy()}
                      onClick={() => void importPastedLots()}
                    >
                      Import lots
                    </button>
                  </div>
                </Show>
              </Show>

              <Show when={documentMode() === "none"}>
                <p class="text-sm text-text-secondary">No serial or lot-tracked lines on this receipt.</p>
              </Show>

              <div class="flex flex-wrap gap-2 border-t border-stroke pt-4">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={posting() || goodsReceipt()!.status !== "draft" || !canPostPartial()}
                  onClick={() => void postReceipt()}
                >
                  {posting() ? "Posting…" : isPartialReceive() ? "Post partial receive" : "Post goods receipt"}
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
              {creating() ? "Creating…" : "Start receive"}
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
