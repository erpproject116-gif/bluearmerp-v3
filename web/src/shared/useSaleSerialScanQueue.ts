import { createSignal, onCleanup } from "solid-js";
import { apiFetch } from "./api";
import type { ResolveScanBatchResult } from "./serialScanTypes";

const BATCH_CHUNK = 25;
const FLUSH_MS = 75;

export type PendingSaleScan = {
  client_scan_id: string;
  serial_no: string;
};

function newClientScanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type SaleScanQueueOptions = {
  locationId?: () => number | null | undefined;
  itemId?: () => number | null | undefined;
  context?: () => "sale" | "release" | "pos";
};

export function useSaleSerialScanQueue(opts: SaleScanQueueOptions) {
  const [pending, setPending] = createSignal<PendingSaleScan[]>([]);
  const [flushing, setFlushing] = createSignal(false);
  const [lastResults, setLastResults] = createSignal<ResolveScanBatchResult[]>([]);

  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushChain: Promise<ResolveScanBatchResult[]> = Promise.resolve([]);

  const flushPending = async (): Promise<ResolveScanBatchResult[]> => {
    const queue = pending();
    if (queue.length === 0) return [];

    setFlushing(true);
    const allResults: ResolveScanBatchResult[] = [];

    try {
      for (let i = 0; i < queue.length; i += BATCH_CHUNK) {
        const chunk = queue.slice(i, i + BATCH_CHUNK);
        const res = await apiFetch<{ results: ResolveScanBatchResult[] }>(
          "/api/v1/inventory/serial-units/resolve-scan/batch",
          {
            method: "POST",
            body: JSON.stringify({
              location_id: opts.locationId?.() ?? undefined,
              item_id: opts.itemId?.() ?? undefined,
              context: opts.context?.() ?? "sale",
              scans: chunk.map((q) => ({
                client_scan_id: q.client_scan_id,
                serial_no: q.serial_no,
              })),
            }),
          },
          { silent: true },
        );
        if (!res.success || !res.data?.results) {
          const msg = res.message ?? "Batch scan failed.";
          allResults.push(
            ...chunk.map((q) => ({
              client_scan_id: q.client_scan_id,
              serial_no: q.serial_no,
              status: "error",
              message: msg,
            })),
          );
          setPending((prev) => prev.filter((p) => !chunk.some((c) => c.client_scan_id === p.client_scan_id)));
          setLastResults(allResults);
          return allResults;
        }
        allResults.push(...res.data.results);
        const doneIds = new Set(chunk.map((c) => c.client_scan_id));
        setPending((prev) => prev.filter((p) => !doneIds.has(p.client_scan_id)));
      }
      setLastResults(allResults);
      return allResults;
    } finally {
      setFlushing(false);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushChain = flushChain.then(() => flushPending());
    }, FLUSH_MS);
  };

  const enqueue = (serialNo: string): string | null => {
    const sn = serialNo.trim();
    if (!sn) return null;
    const entry: PendingSaleScan = { client_scan_id: newClientScanId(), serial_no: sn };
    setPending((prev) => {
      const next = [...prev, entry];
      if (next.length >= BATCH_CHUNK) {
        if (flushTimer) clearTimeout(flushTimer);
        flushChain = flushChain.then(() => flushPending());
      } else {
        scheduleFlush();
      }
      return next;
    });
    return entry.client_scan_id;
  };

  const flushNow = async () => {
    if (flushTimer) clearTimeout(flushTimer);
    await flushChain;
    return flushPending();
  };

  const reset = () => {
    if (flushTimer) clearTimeout(flushTimer);
    setPending([]);
    setLastResults([]);
    flushChain = Promise.resolve([]);
  };

  onCleanup(() => {
    if (flushTimer) clearTimeout(flushTimer);
  });

  return {
    pending,
    pendingCount: () => pending().length,
    flushing,
    lastResults,
    enqueue,
    flushNow,
    reset,
  };
}
