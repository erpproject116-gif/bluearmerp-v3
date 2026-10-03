import { apiFetch } from "../../shared/api";
import type { PosCatalogItem } from "../../shared/usePos";

export type PosScanResolve =
  | { kind: "item"; item: PosCatalogItem }
  | { kind: "serial"; item: PosCatalogItem; serial_unit_id: number; serial_no: string }
  | { kind: "ambiguous"; count: number }
  | { kind: "miss" };

/**
 * Resolver order (Phase 5): exact item_code → single filtered hit → serial resolve-scan.
 * Ambiguous catalog hits are not auto-added.
 */
export async function resolvePosScan(opts: {
  code: string;
  catalog: PosCatalogItem[];
  locationId: number;
}): Promise<PosScanResolve> {
  const code = opts.code.trim();
  if (!code) return { kind: "miss" };

  const exact = opts.catalog.find((i) => i.item_code.toLowerCase() === code.toLowerCase());
  if (exact) return { kind: "item", item: exact };

  const qMatches = opts.catalog.filter(
    (i) =>
      i.item_code.toLowerCase().includes(code.toLowerCase()) ||
      i.item_name.toLowerCase().includes(code.toLowerCase()),
  );
  if (qMatches.length === 1) return { kind: "item", item: qMatches[0]! };
  if (qMatches.length > 1) return { kind: "ambiguous", count: qMatches.length };

  const serialRes = await apiFetch<{
    serial_unit_id: number;
    item_id: number;
    item_code: string;
    serial_no: string;
  }>(
    "/api/v1/inventory/serial-units/resolve-scan",
    {
      method: "POST",
      body: JSON.stringify({ serial_no: code, context: "pos", location_id: opts.locationId }),
    },
    { silent: true },
  );
  if (!serialRes.success || !serialRes.data) return { kind: "miss" };
  const unit = serialRes.data;
  const catalogItem = opts.catalog.find((i) => i.id === unit.item_id);
  if (!catalogItem) return { kind: "miss" };
  return {
    kind: "serial",
    item: catalogItem,
    serial_unit_id: unit.serial_unit_id,
    serial_no: unit.serial_no,
  };
}
