import { createSignal, onCleanup } from "solid-js";
import { apiFetch } from "./api";

export type SerialScanQueueStatus = "pending" | "accepted" | "rejected" | "replay";

export type QueuedScan = {
  client_scan_id: string;
  goods_receipt_line_id: number;
  serial_no: string;
  status: SerialScanQueueStatus;
  serial_id?: number;
  message?: string;
};

export type BatchScanResult = {
  client_scan_id?: string;
  serial_no: string;
  status: string;
  serial_id?: number;
  message?: string;
};

const BATCH_CHUNK = 25;
const FLUSH_MS = 75;
const STORAGE_PREFIX = "gr_serial_queue:";

function storageKey(grId: number) {
  return `${STORAGE_PREFIX}${grId}`;
}

function loadStored(grId: number): QueuedScan[] {
  try {
    const raw = sessionStorage.getItem(storageKey(grId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(grId: number, items: QueuedScan[]) {
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
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapResultStatus(apiStatus: string): SerialScanQueueStatus {
  if (apiStatus === "accepted") return "accepted";
  if (apiStatus === "idempotent_replay") return "replay";
  return "rejected";
}

export function useSerialScanQueue(grId: () => number | null) {
  const [queue, setQueue] = createSignal<QueuedScan[]>([]);
  const [pendingCount, setPendingCount] = createSignal(0);
  const [flushing, setFlushing] = createSignal(false);

  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushChain: Promise<void> = Promise.resolve();

  const syncPendingCount = (items: QueuedScan[]) => {
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

  const persist = (id: number, items: QueuedScan[]) => {
    saveStored(id, items.filter((q) => q.status === "pending"));
    syncPendingCount(items);
  };

  const applyBatchResults = (items: QueuedScan[], results: BatchScanResult[]): QueuedScan[] => {
    const byClientId = new Map<string, BatchScanResult>();
    for (const r of results) {
      if (r.client_scan_id) byClientId.set(r.client_scan_id, r);
    }
    return items.map((q) => {
      if (q.status !== "pending") return q;
      const r = byClientId.get(q.client_scan_id);
      if (!r) return q;
      return {
        ...q,
        serial_no: r.serial_no,
        status: mapResultStatus(r.status),
        serial_id: r.serial_id,
        message: r.message,
      };
    });
  };

  const flushPending = async (id: number) => {
    const pending = queue().filter((q) => q.status === "pending");
    if (pending.length === 0) return [];

    setFlushing(true);
    const allResults: BatchScanResult[] = [];

    try {
      for (let i = 0; i < pending.length; i += BATCH_CHUNK) {
        const chunk = pending.slice(i, i + BATCH_CHUNK);
        const res = await apiFetch<{ results: BatchScanResult[] }>(
          `/api/v1/goods-receipt/goods-receipts/${id}/serials/batch`,
          {
            method: "POST",
            body: JSON.stringify({
              scans: chunk.map((q) => ({
                client_scan_id: q.client_scan_id,
                goods_receipt_line_id: q.goods_receipt_line_id,
                serial_no: q.serial_no,
              })),
            }),
          },
          { silent: true },
        );
        if (!res.success || !res.data?.results) {
          const msg = res.message ?? "Batch scan failed.";
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

  const enqueue = (lineId: number, serialNo: string) => {
    const id = grId();
    if (!id || !serialNo.trim()) return null;

    const entry: QueuedScan = {
      client_scan_id: newClientScanId(),
      goods_receipt_line_id: lineId,
      serial_no: serialNo.trim(),
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
    const results = await flushPending(id);
    return results;
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

export type GoodsReceiptLineLike = {
  id: number;
  received_qty: number;
  expected_qty: number;
  serials?: { id: number; serial_no: string }[];
};

/** Merge accepted batch results into GR lines using queue entries for line mapping. */
export function patchGoodsReceiptLines<T extends GoodsReceiptLineLike>(
  lines: T[],
  queueItems: QueuedScan[],
  results: BatchScanResult[],
): T[] {
  const resultByClient = new Map<string, BatchScanResult>();
  for (const r of results) {
    if (r.client_scan_id) resultByClient.set(r.client_scan_id, r);
  }

  const addedByLine = new Map<number, { id: number; serial_no: string }[]>();
  for (const q of queueItems) {
    const r = resultByClient.get(q.client_scan_id);
    if (!r || (r.status !== "accepted" && r.status !== "idempotent_replay") || !r.serial_id) continue;
    const list = addedByLine.get(q.goods_receipt_line_id) ?? [];
    list.push({ id: r.serial_id, serial_no: r.serial_no });
    addedByLine.set(q.goods_receipt_line_id, list);
  }

  if (addedByLine.size === 0) return lines;

  return lines.map((line) => {
    const added = addedByLine.get(line.id);
    if (!added?.length) return line;
    const existing = line.serials ?? [];
    const existingNos = new Set(existing.map((s) => s.serial_no));
    const newSerials = [...existing];
    let count = 0;
    for (const s of added) {
      if (existingNos.has(s.serial_no)) continue;
      newSerials.push(s);
      existingNos.add(s.serial_no);
      count++;
    }
    if (count === 0) return line;
    return {
      ...line,
      received_qty: Math.min(line.expected_qty, line.received_qty + count),
      serials: newSerials,
    };
  });
}

export function removeSerialFromLine<T extends GoodsReceiptLineLike>(line: T, serialId: number): T {
  const serials = (line.serials ?? []).filter((s) => s.id !== serialId);
  return {
    ...line,
    received_qty: Math.max(0, line.received_qty - 1),
    serials,
  };
}
