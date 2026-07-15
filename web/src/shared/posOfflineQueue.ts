/** Offline queue for POS mutations when the network is unavailable. */
const KEY = "bluearm:pos-offline-queue";

export type PosOfflineAction =
  | {
      id: string;
      kind: "checkout";
      sessionId: number;
      body: Record<string, unknown>;
      createdAt: string;
    }
  | {
      id: string;
      kind: "add_line";
      sessionId: number;
      body: Record<string, unknown>;
      createdAt: string;
    };

function readQueue(): PosOfflineAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PosOfflineAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PosOfflineAction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

export function enqueuePosOffline(action: Omit<PosOfflineAction, "id" | "createdAt"> & { id?: string }) {
  const q = readQueue();
  const item = {
    ...action,
    id: action.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  } as PosOfflineAction;
  q.push(item);
  writeQueue(q);
  return item;
}

export function peekPosOfflineQueue() {
  return readQueue();
}

export function clearPosOfflineQueue() {
  writeQueue([]);
}

export function removePosOfflineAction(id: string) {
  writeQueue(readQueue().filter((a) => a.id !== id));
}

export function isLikelyOfflineError(err: unknown, res?: { success?: boolean; message?: string }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (res?.message || (err instanceof Error ? err.message : String(err || ""))).toLowerCase();
  return (
    msg.includes("err_network") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("load failed")
  );
}
