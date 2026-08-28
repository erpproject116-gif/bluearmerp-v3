import { createSignal, onCleanup } from "solid-js";
import { apiFetch } from "./api";

export type LotScanQueueStatus = "pending" | "accepted" | "rejected" | "replay";

export type QueuedLotScan = {
  client_scan_id: string;
  goods_receipt_line_id: number;
  lot_no: string;
  qty: number;
  expiry_date?: string | null;
  gross_weight_kg?: number | null;
  status: LotScanQueueStatus;
  lot_id?: number;
  message?: string;
};

export type BatchLotScanResult = {
  client_scan_id?: string;
  lot_no: string;
  qty?: number;
  status: string;
  lot_id?: number;
  message?: string;
};

export type LotScanEnqueueInput = {
  lineId: number;
  lotNo: string;
  qty: number;
  expiryDate?: string | null;
  grossWeightKg?: number | null;
};

const BATCH_CHUNK = 25;
const FLUSH_MS = 75;
const STORAGE_PREFIX = "gr_lot_queue:";

function storageKey(grId: number) {
  return `${STORAGE_PREFIX}${grId}`;
}

function loadStored(grId: number): QueuedLotScan[] {
  try {
    const raw = sessionStorage.getItem(storageKey(grId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedLotScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(grId: number, items: QueuedLotScan[]) {
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(storageKey(grId));
      return;
    }
    sessionStorage.setItem(storageKey(grId), JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

function newClientScanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `lot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapResultStatus(apiStatus: string): LotScanQueueStatus {
  if (apiStatus === "accepted") return "accepted";
  if (apiStatus === "idempotent_replay") return "replay";
  return "rejected";
}

export function useLotScanQueue(grId: () => number | null) {
  const [queue, setQueue] = createSignal<QueuedLotScan[]>([]);
  const [pendingCount, setPendingCount] = createSignal(0);
  const [flushing, setFlushing] = createSignal(false);

  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushChain: Promise<void> = Promise.resolve();

  const syncPendingCount = (items: QueuedLotScan[]) => {
    setPendingCount(items.filter((q) => q.status === "pending").length);
  };

  const initFromStorage = (id: number) => {
    const stored = loadStored(id).filter((q) => q.status === "pending");
    setQueue(stored);
    syncPendingCount(stored);
    if (stored.length > 0) {
      void scheduleFlush(id);
    }
  };

  const persist = (id: number, items: QueuedLotScan[]) => {
    saveStored(id, items.filter((q) => q.status === "pending"));
    syncPendingCount(items);
  };

  const applyBatchResults = (items: QueuedLotScan[], results: BatchLotScanResult[]): QueuedLotScan[] => {
    const byClientId = new Map<string, BatchLotScanResult>();
    for (const r of results) {
      if (r.client_scan_id) byClientId.set(r.client_scan_id, r);
    }
    return items.map((q) => {
      if (q.status !== "pending") return q;
      const r = byClientId.get(q.client_scan_id);
      if (!r) return q;
      return {
        ...q,
        lot_no: r.lot_no,
        qty: r.qty ?? q.qty,
        status: mapResultStatus(r.status),
        lot_id: r.lot_id,
        message: r.message,
      };
    });
  };

  const flushPending = async (id: number) => {
    const pending = queue().filter((q) => q.status === "pending");
    if (pending.length === 0) return [];

    setFlushing(true);
    const allResults: BatchLotScanResult[] = [];

    try {
      for (let i = 0; i < pending.length; i += BATCH_CHUNK) {
        const chunk = pending.slice(i, i + BATCH_CHUNK);
        const res = await apiFetch<{ results: BatchLotScanResult[] }>(
          `/api/v1/goods-receipt/goods-receipts/${id}/lots/batch`,
          {
            method: "POST",
            body: JSON.stringify({
              scans: chunk.map((q) => ({
                client_scan_id: q.client_scan_id,
                goods_receipt_line_id: q.goods_receipt_line_id,
                lot_no: q.lot_no,
                qty: q.qty,
                expiry_date: q.expiry_date ?? undefined,
                gross_weight_kg: q.gross_weight_kg ?? undefined,
              })),
            }),
          },
          { silent: true },
        );
        if (!res.success || !res.data?.results) {
          const msg = res.message ?? "Batch lot scan failed.";
          setQueue((prev) => {
            const next = prev.map((q) =>
              chunk.some((c) => c.client_scan_id === q.client_scan_id) && q.status === "pending"
                ? { ...q, status: "rejected" as const, message: msg }
                : q,
            );
            persist(id, next);
            return next;
          });
          return allResults;
        }
        allResults.push(...res.data.results);
        setQueue((prev) => {
          const next = applyBatchResults(prev, res.data!.results);
          persist(id, next);
          return next;
        });
      }
      return allResults;
    } finally {
      setFlushing(false);
    }
  };

  const scheduleFlush = (id: number) => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushChain = flushChain.then(() => flushPending(id)).then(() => undefined);
    }, FLUSH_MS);
  };

  const enqueue = (input: LotScanEnqueueInput) => {
    const id = grId();
    if (!id || !input.lotNo.trim() || !Number.isFinite(input.qty) || input.qty <= 0) return null;

    const entry: QueuedLotScan = {
      client_scan_id: newClientScanId(),
      goods_receipt_line_id: input.lineId,
      lot_no: input.lotNo.trim(),
      qty: input.qty,
      expiry_date: input.expiryDate ?? null,
      gross_weight_kg: input.grossWeightKg ?? null,
      status: "pending",
    };

    setQueue((prev) => {
      const next = [...prev, entry];
      persist(id, next);
      return next;
    });

    if (queue().filter((q) => q.status === "pending").length >= BATCH_CHUNK) {
      if (flushTimer) clearTimeout(flushTimer);
      flushChain = flushChain.then(() => flushPending(id)).then(() => undefined);
    } else {
      scheduleFlush(id);
    }

    return entry.client_scan_id;
  };

  const flushNow = async () => {
    const id = grId();
    if (!id) return [];
    if (flushTimer) clearTimeout(flushTimer);
    await flushChain;
    return flushPending(id);
  };

  const clearCompleted = () => {
    const id = grId();
    if (!id) return;
    setQueue((prev) => {
      const next = prev.filter((q) => q.status === "pending");
      persist(id, next);
      return next;
    });
  };

  const resetQueue = () => {
    const id = grId();
    if (id) sessionStorage.removeItem(storageKey(id));
    setQueue([]);
    setPendingCount(0);
  };

  onCleanup(() => {
    if (flushTimer) clearTimeout(flushTimer);
  });

  return {
    queue,
    pendingCount,
    flushing,
    enqueue,
    flushNow,
    clearCompleted,
    resetQueue,
    initFromStorage,
  };
}

export type GoodsReceiptLotLineLike = {
  id: number;
  received_qty: number;
  expected_qty: number;
  lots?: { id: number; lot_no: string; qty: number; expiry_date?: string | null }[];
};

/** Merge accepted batch results into GR lines using queue entries for line mapping. */
export function patchGoodsReceiptLotLines<T extends GoodsReceiptLotLineLike>(
  lines: T[],
  queueItems: QueuedLotScan[],
  results: BatchLotScanResult[],
): T[] {
  const resultByClient = new Map<string, BatchLotScanResult>();
  for (const r of results) {
    if (r.client_scan_id) resultByClient.set(r.client_scan_id, r);
  }

  const addedByLine = new Map<number, { id: number; lot_no: string; qty: number; expiry_date?: string | null }[]>();
  for (const q of queueItems) {
    const r = resultByClient.get(q.client_scan_id);
    if (!r || (r.status !== "accepted" && r.status !== "idempotent_replay") || !r.lot_id) continue;
    const list = addedByLine.get(q.goods_receipt_line_id) ?? [];
    list.push({
      id: r.lot_id,
      lot_no: r.lot_no,
      qty: r.qty ?? q.qty,
      expiry_date: q.expiry_date,
    });
    addedByLine.set(q.goods_receipt_line_id, list);
  }

  if (addedByLine.size === 0) return lines;

  return lines.map((line) => {
    const added = addedByLine.get(line.id);
    if (!added?.length) return line;
    const existing = line.lots ?? [];
    const existingKeys = new Set(existing.map((l) => `${l.lot_no}:${l.id}`));
    const newLots = [...existing];
    let qtyDelta = 0;
    for (const l of added) {
      const key = `${l.lot_no}:${l.id}`;
      if (existingKeys.has(key)) continue;
      newLots.push(l);
      existingKeys.add(key);
      qtyDelta += l.qty;
    }
    if (qtyDelta === 0) return line;
    return {
      ...line,
      received_qty: Math.min(line.expected_qty, line.received_qty + qtyDelta),
      lots: newLots,
    };
  });
}
