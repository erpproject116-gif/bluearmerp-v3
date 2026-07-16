import { apiFetch } from "./api";
import type { ResolveScanBatchResult, ResolvedSerialUnit } from "./serialScanTypes";

export type ResolveSerialBulkOptions = {
  locationId?: number | null;
  itemId?: number | null;
  context?: "sale" | "release" | "pos";
};

export type ResolveSerialBulkResult = {
  units: ResolvedSerialUnit[];
  errors: string[];
};

function newClientScanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Resolve serial numbers to inventory units (batch API). Preserves input order for accepted units. */
export async function resolveSerialBulk(
  serialNos: string[],
  opts: ResolveSerialBulkOptions,
): Promise<ResolveSerialBulkResult> {
  const trimmed = serialNos.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length === 0) return { units: [], errors: [] };

  const scans = trimmed.map((serial_no) => ({ client_scan_id: newClientScanId(), serial_no }));
  const res = await apiFetch<{ results: ResolveScanBatchResult[] }>(
    "/api/v1/inventory/serial-units/resolve-scan/batch",
    {
      method: "POST",
      body: JSON.stringify({
        location_id: opts.locationId ?? undefined,
        item_id: opts.itemId ?? undefined,
        context: opts.context ?? "sale",
        scans,
      }),
    },
    { silent: true },
  );

  if (!res.success || !res.data?.results) {
    return { units: [], errors: [res.message ?? "Failed to resolve serials."] };
  }

  const bySerial = new Map<string, ResolveScanBatchResult>();
  for (const r of res.data.results) {
    bySerial.set(r.serial_no.toLowerCase(), r);
  }

  const units: ResolvedSerialUnit[] = [];
  const errors: string[] = [];
  const seenIds = new Set<number>();

  for (const sn of trimmed) {
    const r = bySerial.get(sn.toLowerCase());
    if (!r) {
      errors.push(`${sn}: not found in response.`);
      continue;
    }
    if (r.status === "accepted" && r.unit) {
      if (seenIds.has(r.unit.serial_unit_id)) {
        errors.push(`${sn}: duplicate on line.`);
        continue;
      }
      seenIds.add(r.unit.serial_unit_id);
      units.push(r.unit);
    } else {
      errors.push(`${sn}: ${r.message ?? r.status}`);
    }
  }

  return { units, errors };
}
