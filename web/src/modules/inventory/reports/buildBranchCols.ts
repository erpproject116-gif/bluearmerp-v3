import type { InventoryStatusRow } from "../../../shared/reports/useModuleReports";

export type AuthBranch = { id: number; location_name: string; location_code?: string; location_type?: string };
export type LocationOpt = { id: number; location_name: string; is_rma?: boolean | string | number; status?: string };

/** One matrix column; may merge multiple location ids that share the same display name. */
export type BranchCol = { key: string; id: number; name: string; locationIds: number[] };

export function isRmaLocation(l: { is_rma?: boolean | string | number }): boolean {
  const v = l.is_rma;
  return v === true || v === 1 || v === "1" || v === "true";
}

export function isActiveLocation(l: { status?: string | null }): boolean {
  if (l.status == null || l.status === "") return true;
  return String(l.status).toLowerCase() === "active";
}

/**
 * One column per tenant branch. Prefer auth/branches (same list as the HQ switcher),
 * then active non-RMA inventory locations, then any location present in report rows.
 * Duplicate display names are merged; HQ is pinned first.
 */
export function buildBranchCols(
  authBranches: AuthBranch[],
  locs: LocationOpt[],
  rows: InventoryStatusRow[],
): BranchCol[] {
  const byName = new Map<string, BranchCol>();
  const push = (rawId: number | string | null | undefined, name: string) => {
    const id = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(id) || id <= 0) return;
    const label = (name || `Location ${id}`).trim() || `Location ${id}`;
    const key = label.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (!existing.locationIds.includes(id)) existing.locationIds.push(id);
      return;
    }
    byName.set(key, { key, id, name: label, locationIds: [id] });
  };

  // Sidebar branches first — always includes HQ for owners/operators even when
  // inventory.locations permission is missing or the current item page has zeros.
  for (const b of authBranches) {
    push(b.id, b.location_name);
  }
  for (const l of locs) {
    if (isRmaLocation(l) || !isActiveLocation(l)) continue;
    push(l.id, l.location_name);
  }
  for (const r of rows) {
    push(r.location_id, r.branch_name || r.location_name);
  }

  return [...byName.values()].sort((a, b) => {
    const rank = (n: string) => (/^hq$/i.test(n.trim()) ? 0 : 1);
    const d = rank(a.name) - rank(b.name);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}
