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
  removeSerialFromLine,
  useSerialScanQueue,
  type BatchScanResult,
  type QueuedScan,
} from "../../../shared/useSerialScanQueue";
import { SerialLotLayout } from "./SerialLotLayout";
import { SerialReceiveScanner } from "../../../shared/SerialReceiveScanner";
import { SerialLineCell } from "../../../shared/SerialLineCell";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { parseAndDedupeSerialBulkInput } from "../../../shared/serialBulkParse";

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
  item_code: string;
  item_name: string;
  track_serial: boolean;
  track_lot: boolean;
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

type GrSerialGapRow = {
  goods_receipt_id: number;
  goods_receipt_line_id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  expected_qty: number;
  received_qty: number;
  serial_count: number;
  gap_qty: number;
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
  const [params] = useSearchParams();

  const [poLabel, setPoLabel] = createSignal("");
  const [selectedPoId, setSelectedPoId] = createSignal<number | null>(null);
  const [selectedPo, setSelectedPo] = createSignal<PurchaseOrderRow | null>(null);
  const [receiptDate, setReceiptDate] = createSignal(todayISO());
  const [goodsReceipt, setGoodsReceipt] = createSignal<GoodsReceipt | null>(null);
  const [scanLineId, setScanLineId] = createSignal<number | null>(null);
  const [lotLineId, setLotLineId] = createSignal<number | null>(null);
  const [lotNo, setLotNo] = createSignal("");
  const [lotQty, setLotQty] = createSignal("1");
  const [lotExpiry, setLotExpiry] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [addingLot, setAddingLot] = createSignal(false);
  const [posting, setPosting] = createSignal(false);
  const [grGaps, setGrGaps] = createSignal<GrSerialGapRow[]>([]);
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [pasteText, setPasteText] = createSignal("");
  const [pasteBusy, setPasteBusy] = createSignal(false);

  const appliedScanIds = new Set<string>();
  const scanQueue = useSerialScanQueue(() => goodsReceipt()?.id ?? null);

  const serialLines = () => (goodsReceipt()?.lines ?? []).filter((l) => l.track_serial);
  const lotLines = () => (goodsReceipt()?.lines ?? []).filter((l) => l.track_lot);

  const serialPostBlocked = createMemo(() => {
    const lines = serialLines();
    if (lines.length === 0) return false;
    // Partial receive is allowed: only require serial count to match this receive qty.
    // Do not require received_qty === expected_qty (PO open qty).
    return lines.some((l) => {
      const serialCount = l.serials?.length ?? 0;
      return Math.abs(l.received_qty - serialCount) > 0.0001;
    });
  });

  const canPostPartial = createMemo(() => {
    const gr = goodsReceipt();
    if (!gr || gr.status !== "draft") return false;
    const lines = gr.lines ?? [];
    const anyReceived = lines.some((l) => l.received_qty > 0.0001);
    if (!anyReceived) return false;
    if (serialPostBlocked()) return false;
    return true;
  });

  const isPartialReceive = createMemo(() => {
    const lines = goodsReceipt()?.lines ?? [];
    return lines.some((l) => l.received_qty > 0.0001 && l.received_qty + 0.0001 < l.expected_qty);
  });

  const updateLineSerials = (lineId: number, serials: { id: number; serial_no: string }[], receivedQty: number) => {
    setGoodsReceipt((gr) => {
      if (!gr?.lines) return gr;
      return {
        ...gr,
        lines: gr.lines.map((l) => (l.id === lineId ? { ...l, serials, received_qty: receivedQty } : l)),
      };
    });
    setScanLineId(lineId);
    const gr = goodsReceipt();
    if (gr) void loadGrGaps(gr.id);
  };

  const loadGrGaps = async (grId: number) => {
    const qs = new URLSearchParams({ goods_receipt_id: String(grId) });
    const res = await apiFetch<GrSerialGapRow[]>(`/api/v1/inventory/reconciliation/gr-serial-gap?${qs}`, undefined, {
      silent: true,
    });
    setGrGaps(res.success && res.data ? res.data : []);
  };

  const applyFlushToReceipt = (queueSlice: QueuedScan[], results: BatchScanResult[]) => {
    const fresh = queueSlice.filter((q) => !appliedScanIds.has(q.client_scan_id));
    if (fresh.length === 0) return;
    for (const q of fresh) {
      const r = results.find((x) => x.client_scan_id === q.client_scan_id);
      if (r && (r.status === "accepted" || r.status === "idempotent_replay")) {
        appliedScanIds.add(q.client_scan_id);
      }
    }
    const rejected = queueSlice.filter((q) => {
      const r = results.find((x) => x.client_scan_id === q.client_scan_id);
      return r && r.status !== "accepted" && r.status !== "idempotent_replay";
    });
    for (const q of rejected) {
      toast.warning(`${q.serial_no}: ${results.find((r) => r.client_scan_id === q.client_scan_id)?.message ?? "Rejected"}`);
    }

    setGoodsReceipt((gr) => {
      if (!gr?.lines) return gr;
      return {
        ...gr,
        lines: patchGoodsReceiptLines(gr.lines, fresh, results),
      };
    });

    const activeLine = scanLineId();
    if (activeLine) {
      const line = goodsReceipt()?.lines?.find((l) => l.id === activeLine);
      if (line && line.received_qty + 0.0001 >= line.expected_qty) {
        toast.success(`Line complete (${line.item_code}).`);
      }
    }
    void loadGrGaps(goodsReceipt()!.id);
  };

  createEffect(() => {
    const q = scanQueue.queue();
    const gr = goodsReceipt();
    if (!gr) return;
    const done = q.filter(
      (item) =>
        (item.status === "accepted" || item.status === "replay") && !appliedScanIds.has(item.client_scan_id),
    );
    if (done.length === 0) return;
    const results: BatchScanResult[] = done.map((item) => ({
      client_scan_id: item.client_scan_id,
      serial_no: item.serial_no,
      status: item.status === "replay" ? "idempotent_replay" : "accepted",
      serial_id: item.serial_id,
    }));
    applyFlushToReceipt(done, results);
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
      toast.warning("This purchase order has no receive location. Edit the PO and set a location, then try again.");
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
      const detail = res.errors
        ? Object.values(res.errors).filter(Boolean).join(" ")
        : undefined;
      toast.warning(detail || res.message || "Failed to create goods receipt.");
      return;
    }
    appliedScanIds.clear();
    scanQueue.resetQueue();
    setGoodsReceipt(res.data);
    scanQueue.initFromStorage(res.data.id);
    const firstSerialLine = res.data.lines?.find((l) => l.track_serial);
    if (firstSerialLine) setScanLineId(firstSerialLine.id);
    const firstLotLine = res.data.lines?.find((l) => l.track_lot);
    if (firstLotLine) setLotLineId(firstLotLine.id);
    void loadGrGaps(res.data.id);
    toast.success("Goods receipt created. Scan serial numbers or enter lots.");
  };


  const undoLastSerial = async () => {
    const gr = goodsReceipt();
    const lineId = scanLineId();
    if (!gr || !lineId) return;
    const line = gr.lines?.find((l) => l.id === lineId);
    const serials = line?.serials ?? [];
    if (serials.length === 0) {
      toast.warning("No serials to undo on this line.");
      return;
    }
    const last = serials[serials.length - 1];
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${gr.id}/serials/${last.id}`,
      { method: "DELETE" },
      { silent: true },
    );
    if (!res.success) {
      toast.warning(res.message ?? "Failed to remove serial.");
      return;
    }
    setGoodsReceipt((g) => {
      if (!g?.lines) return g;
      return {
        ...g,
        lines: g.lines.map((l) => (l.id === lineId ? removeSerialFromLine(l, last.id) : l)),
      };
    });
    void loadGrGaps(gr.id);
    toast.success(`Removed ${last.serial_no}`);
  };

  const importPastedSerials = async () => {
    const gr = goodsReceipt();
    const lineId = scanLineId();
    if (!gr || !lineId) {
      toast.warning("Select a scan line first.");
      return;
    }
    const lines = parseAndDedupeSerialBulkInput(pasteText());
    if (lines.length === 0) {
      toast.warning("Paste at least one serial (one per line, or comma-separated).");
      return;
    }
    setPasteBusy(true);
    for (const sn of lines) {
      scanQueue.enqueue(lineId, sn);
    }
    await scanQueue.flushNow();
    setPasteBusy(false);
    setPasteText("");
    setPasteOpen(false);
    toast.success(`Queued ${lines.length} serial(s). If some were rejected as “already exists”, they were registered earlier (Generate) — scan the physical labels for this delivery instead.`);
  };

  const addLot = async () => {
    const gr = goodsReceipt();
    const lineId = lotLineId();
    const lot = lotNo().trim();
    const qty = Number(lotQty());
    if (!gr || !lineId || !lot || !Number.isFinite(qty) || qty <= 0) {
      toast.warning("Select a line, enter lot no., and a positive quantity.");
      return;
    }

    setAddingLot(true);
    const res = await apiFetch(
      `/api/v1/goods-receipt/goods-receipts/${gr.id}/lots`,
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
      return;
    }
    const refresh = await apiFetch<GoodsReceipt>(`/api/v1/goods-receipt/goods-receipts/${gr.id}`);
    if (refresh.success && refresh.data) setGoodsReceipt(refresh.data);
    setLotNo("");
    setLotQty("1");
    setLotExpiry("");
    toast.success(`Added lot ${lot}`);
  };

  const postReceipt = async () => {
    const gr = goodsReceipt();
    if (!gr) return;
    if (serialPostBlocked()) {
      toast.warning(
        "Each serial line needs matching scans (serial count = this receive qty). Scan or paste serials from the delivery labels — do not use Generate from the registry (those are already in stock).",
      );
      return;
    }
    if (!canPostPartial()) {
      toast.warning("Receive at least one unit (scan a serial, add a lot, or set qty) before posting.");
      return;
    }

    await scanQueue.flushNow();
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
    toast.success(
      isPartialReceive()
        ? "Purchase Receive posted (partial). Remaining qty stays open on the purchase order."
        : "Goods receipt posted.",
    );
    invalidate();
    appliedScanIds.clear();
    scanQueue.resetQueue();
    setGoodsReceipt(null);
    setSelectedPoId(null);
    setSelectedPo(null);
    setPoLabel("");
    setScanLineId(null);
    setLotLineId(null);
    setLotNo("");
    setLotQty("1");
    setLotExpiry("");
    setGrGaps([]);
  };

  const reset = () => {
    appliedScanIds.clear();
    scanQueue.resetQueue();
    setGoodsReceipt(null);
    setSelectedPoId(null);
    setSelectedPo(null);
    setPoLabel("");
    setScanLineId(null);
    setLotLineId(null);
    setLotNo("");
    setLotQty("1");
    setLotExpiry("");
    setReceiptDate(todayISO());
    setGrGaps([]);
    setPasteOpen(false);
    setPasteText("");
  };

  createEffect(() => {
    const grId = Number(params.gr_id);
    if (goodsReceipt() || !grId || grId <= 0) return;
    void (async () => {
      const res = await apiFetch<GoodsReceipt>(`/api/v1/goods-receipt/goods-receipts/${grId}`);
      if (res.success && res.data?.status === "draft") {
        setGoodsReceipt(res.data);
        scanQueue.initFromStorage(res.data.id);
        const firstSerialLine = res.data.lines?.find((l) => l.track_serial);
        if (firstSerialLine) setScanLineId(firstSerialLine.id);
        void loadGrGaps(res.data.id);
      }
    })();
  });

  onMount(() => {
    const gr = goodsReceipt();
    if (gr) scanQueue.initFromStorage(gr.id);
    // Baiko approve-to-seed handoff: stage proposed serials into the paste
    // buffer only — nothing is registered until the user clicks Import.
    const seed = takeSerialLotSeed();
    if (seed?.rows?.length) {
      const serials = seed.rows
        .map((row) => row.serial?.trim())
        .filter((s): s is string => !!s);
      if (serials.length > 0) {
        setPasteText(serials.join("\n"));
        setPasteOpen(true);
        toast.success(
          `Baiko staged ${serials.length} serial(s) from ${seed.file_name || "your attachment"}. ` +
            "Create or select a goods receipt, pick the scan line, then Import to confirm.",
        );
      }
      const lotCount = seed.rows.filter((row) => row.lot?.trim()).length;
      if (lotCount > 0) {
        toast.warning(`${lotCount} lot value(s) in the file are not staged automatically — enter lots via the lot fields.`);
      }
    }
  });

  return (
    <SerialLotLayout>
      <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p class="font-medium">Prefer New Bill for new purchases</p>
        <p class="mt-1 text-amber-900/90">
          Scan serials on Buy → Bills → New Bill; confirming posts stock and AP. This page is for legacy draft
          receives only.
        </p>
        <A
          href="/app/purchases/purchases/new"
          class="mt-2 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Use New Bill
        </A>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-text-primary">{uiLabel("goods_receipt.receive_page_title")}</h2>
          <p class="text-sm text-text-secondary">
            Start from a purchase order, then receive what actually arrived. Scan each unit’s serial — it adds 1
            automatically (or press Enter). You can post a partial delivery — remaining qty stays open on the PO.
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
                  {scanQueue.pendingCount() > 0 && (
                    <>
                      {" · "}
                      <span class="font-medium text-amber-700">{scanQueue.pendingCount()} pending</span>
                    </>
                  )}
                </p>
              </div>

              <Show when={lotLines().length > 0 && serialLines().length === 0}>
                <div class="rounded-lg border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-slate-700">
                  <p class="font-medium text-slate-800">Where do lot numbers come from?</p>
                  <p class="mt-1 text-xs leading-snug">
                    Enter the lot / batch numbers from the supplier delivery (and qty per lot) until Received matches
                    Expected.{" "}
                    <A href="/app/inventory/serial-lot/lots" class="font-medium text-brand-700 hover:underline">
                      Lot batches
                    </A>{" "}
                    lists lots already in stock after you post.
                  </p>
                </div>
              </Show>

              <Show when={serialLines().length > 0}>
                <div class="rounded-lg border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-slate-700">
                  <p class="font-medium text-slate-800">Where do the serials come from?</p>
                  <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-snug">
                    <li>
                      Scan or type the serial printed on the <span class="font-medium">physical unit</span>. It adds
                      automatically after a short pause (or press Enter). Each one adds 1 to quantity.
                    </li>
                    <li>
                      Partial is OK — e.g. PO ordered 5, only 2 arrived → scan 2 and Post. The other 3 stay open on the
                      PO for a later receive.
                    </li>
                    <li>
                      Do <span class="font-medium">not</span> paste serials from{" "}
                      <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-700 hover:underline">
                        Generate
                      </A>{" "}
                      in the registry — Generate already puts them in stock, so receive will reject them as duplicates.
                    </li>
                  </ul>
                </div>
              </Show>

              <Show when={grGaps().length > 0}>
                <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p class="font-medium">Serial count mismatch on draft receipt</p>
                  <ul class="mt-1 list-inside list-disc">
                    <For each={grGaps()}>
                      {(g) => (
                        <li>
                          Line {g.line_no} {g.item_code}: received {g.received_qty}, serials {g.serial_count} (gap{" "}
                          {g.gap_qty}) — scan {g.gap_qty} more from the delivery label
                          {g.item_code ? (
                            <>
                              {" · "}
                              <A
                                href={`/app/inventory/serial-lot/registry?q=${encodeURIComponent(g.item_code)}`}
                                class="underline hover:no-underline"
                              >
                                Check registry for {g.item_code}
                              </A>
                            </>
                          ) : null}
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={serialLines().length > 0}>
                <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                  <h3 class="mb-2 text-sm font-semibold text-text-primary">{uiLabel("goods_receipt.pre_post_review")}</h3>
                  <table class="min-w-full text-sm">
                    <thead class="text-left text-text-secondary">
                      <tr>
                        <th class="py-1 pr-3">Line</th>
                        <th class="py-1 pr-3">Item</th>
                        <th class="py-1 pr-3">PO open</th>
                        <th class="py-1 pr-3">This receive</th>
                        <th class="py-1 pr-3">Serials</th>
                        <th class="py-1">Still open</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={serialLines()}>
                        {(line) => {
                          const serialCount = () => line.serials?.length ?? 0;
                          const serialMismatch = () => Math.abs(line.received_qty - serialCount()) > 0.0001;
                          const stillOpen = () => Math.max(0, line.expected_qty - line.received_qty);
                          return (
                            <tr class="border-t border-stroke/60">
                              <td class="py-1 pr-3">{line.line_no}</td>
                              <td class="py-1 pr-3">
                                {line.item_code} — {line.item_name}
                              </td>
                              <td class="py-1 pr-3">{line.expected_qty}</td>
                              <td class="py-1 pr-3">{line.received_qty}</td>
                              <td class="py-1 pr-3">
                                <SerialLineCell
                                  mode="receive"
                                  grId={goodsReceipt()!.id}
                                  lineId={line.id}
                                  itemCode={line.item_code}
                                  itemName={line.item_name}
                                  expectedQty={line.expected_qty}
                                  receivedQty={line.received_qty}
                                  serials={line.serials ?? []}
                                  status={goodsReceipt()!.status}
                                  onSerialsChange={(serials, receivedQty) => updateLineSerials(line.id, serials, receivedQty)}
                                  onAfterScan={() => void loadGrGaps(goodsReceipt()!.id)}
                                />
                              </td>
                              <td
                                class={`py-1 ${
                                  serialMismatch()
                                    ? "font-medium text-red-600"
                                    : stillOpen() > 0.0001
                                      ? "text-amber-700"
                                      : "text-green-700"
                                }`}
                              >
                                {serialMismatch()
                                  ? "Fix serial count"
                                  : stillOpen() > 0.0001
                                    ? stillOpen().toFixed(0)
                                    : "OK"}
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>

              <Show when={lotLines().length > 0}>
                <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                  <h3 class="mb-3 text-sm font-semibold text-text-primary">{uiLabel("goods_receipt.lot_entry")}</h3>
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
                        class={inputClass}
                        value={lotNo()}
                        onInput={(e) => setLotNo(e.currentTarget.value)}
                        placeholder="Lot / batch no."
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
                </div>

                <div class="overflow-x-auto rounded-lg border border-stroke">
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
                            <td class="px-3 py-2">
                              {(line.lots ?? [])
                                .map((l) => `${l.lot_no} (${l.qty}${l.expiry_date ? `, exp ${l.expiry_date}` : ""})`)
                                .join("; ") || "—"}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>

              <Show when={serialLines().length > 0}>
                <SerialReceiveScanner
                  grId={goodsReceipt()!.id}
                  lines={goodsReceipt()!.lines ?? []}
                  status={goodsReceipt()!.status}
                  onLinesUpdate={(lines) => {
                    setGoodsReceipt((gr) => (gr ? { ...gr, lines: lines as GoodsReceiptLine[] } : gr));
                  }}
                  onAfterScan={() => void loadGrGaps(goodsReceipt()!.id)}
                />

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50 disabled:opacity-50"
                    disabled={!scanLineId()}
                    onClick={() => void undoLastSerial()}
                  >
                    Undo last
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                    onClick={() => setPasteOpen((v) => !v)}
                  >
                    {pasteOpen() ? "Hide paste" : "Paste serials"}
                  </button>
                  {scanQueue.flushing() && (
                    <span class="self-center text-xs text-text-secondary">Syncing…</span>
                  )}
                </div>

                <Show when={pasteOpen()}>
                  <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                    <Field label="One serial per line">
                      <textarea
                        class={`${inputClass} min-h-[120px] font-mono text-sm`}
                        value={pasteText()}
                        onInput={(e) => setPasteText(e.currentTarget.value)}
                        placeholder="SN001&#10;SN002&#10;SN003"
                      />
                    </Field>
                    <button
                      type="button"
                      class="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      disabled={pasteBusy() || !scanLineId()}
                      onClick={() => void importPastedSerials()}
                    >
                      {pasteBusy() ? "Importing…" : "Import pasted serials"}
                    </button>
                  </div>
                </Show>

                <div class="overflow-x-auto rounded-lg border border-stroke">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50 text-left text-text-secondary">
                      <tr>
                        <th class="px-3 py-2">Line</th>
                        <th class="px-3 py-2">Product</th>
                        <th class="px-3 py-2">PO open</th>
                        <th class="px-3 py-2">This receive</th>
                        <th class="px-3 py-2">Scan serials (auto-add)</th>
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
                              <SerialLineCell
                                mode="receive"
                                grId={goodsReceipt()!.id}
                                lineId={line.id}
                                itemCode={line.item_code}
                                itemName={line.item_name}
                                expectedQty={line.expected_qty}
                                receivedQty={line.received_qty}
                                serials={line.serials ?? []}
                                status={goodsReceipt()!.status}
                                onSerialsChange={(serials, receivedQty) => updateLineSerials(line.id, serials, receivedQty)}
                                onAfterScan={() => void loadGrGaps(goodsReceipt()!.id)}
                              />
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>

              <Show when={serialLines().length === 0 && lotLines().length === 0}>
                <p class="text-sm text-text-secondary">No serial or lot-tracked lines on this goods receipt.</p>
              </Show>

              <Show when={isPartialReceive()}>
                <p class="text-xs text-amber-800">
                  Partial receive: you will post less than the PO open qty. Remaining stays on the purchase order for a
                  later delivery.
                </p>
              </Show>

              <div class="flex flex-wrap gap-2 border-t border-stroke pt-4">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  disabled={posting() || goodsReceipt()!.status !== "draft" || !canPostPartial()}
                  onClick={() => void postReceipt()}
                >
                  {posting()
                    ? "Posting…"
                    : isPartialReceive()
                      ? "Post partial receive"
                      : "Post goods receipt"}
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
