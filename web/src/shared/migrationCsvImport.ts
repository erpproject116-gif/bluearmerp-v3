import { apiBase, getAccessToken, type ApiResult } from "./api";
import { apiFetch } from "./api";

export type MigKind = "items" | "partners" | "accounts";

export type MigImportProfile = {
  id: number;
  kind: MigKind;
  name: string;
  column_map: Record<string, string>;
  updated_at?: string;
};

export type MigImportResult = {
  created: number;
  updated?: number;
  failed: number;
  row_errors?: { row: number; message: string }[];
};

export const MIG_ENTITY_FIELDS: Record<MigKind, string[]> = {
  items: [
    "item_name",
    "purchase_price",
    "sales_price",
    "vip_price",
    "status",
    "track_serial",
    "track_lot",
    "track_inventory_qty",
    "warranty_duration_months",
    "spec_name",
    "unit",
    "item_category",
    "item_type",
    "oe_price",
  ],
  partners: ["company_name", "partner_kind", "ceo_name", "phone", "mobile", "email", "address", "tin", "status"],
  accounts: ["account_code", "account_name", "account_type", "is_group", "is_active", "sort_order"],
};

export const MIG_REQUIRED: Record<MigKind, string[]> = {
  items: ["item_name"],
  partners: ["company_name", "partner_kind"],
  accounts: ["account_code", "account_name", "account_type"],
};

const migBase = `${apiBase}/api/v1/migration`;

/** Copilot "map_import_dataset" Approve stages this seed; Migration Center consumes it once. */
export type MigImportSeed = {
  kind: MigKind;
  file_name?: string;
  headers?: string[];
  column_map?: Record<string, string>;
  csv_text?: string;
  truncated?: boolean;
};

export const MIG_IMPORT_SEED_KEY = "bluearm.migImportSeed";

export function takeMigImportSeed(): MigImportSeed | null {
  try {
    const raw = sessionStorage.getItem(MIG_IMPORT_SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MIG_IMPORT_SEED_KEY);
    const parsed = JSON.parse(raw) as MigImportSeed;
    if (!parsed || typeof parsed !== "object") return null;
    if (!["items", "partners", "accounts"].includes(parsed.kind)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listMigImportProfiles(kind: MigKind) {
  return apiFetch<MigImportProfile[]>(`/api/v1/migration/import-profiles?kind=${encodeURIComponent(kind)}`);
}

export function upsertMigImportProfile(body: { kind: MigKind; name: string; column_map: Record<string, string> }) {
  return apiFetch<MigImportProfile>("/api/v1/migration/import-profiles", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function importMigMapped(
  kind: MigKind,
  file: File,
  opts: { profileId?: number | null; columnMap: Record<string, string> },
): Promise<ApiResult<MigImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  if (opts.profileId) fd.append("profile_id", String(opts.profileId));
  fd.append("column_map", JSON.stringify(opts.columnMap));
  const path =
    kind === "items" ? "/items/import-mapped" : kind === "partners" ? "/partners/import-mapped" : "/accounts/import-mapped";
  const res = await fetch(`${migBase}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<MigImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}
