import { apiBase, getAccessToken, type ApiResult } from "./api";
import { apiFetch } from "./api";

export type MigKind =
  | "items"
  | "partners"
  | "accounts"
  | "opening_stock"
  | "open_si"
  | "open_ap"
  | "open_po"
  | "in_transit";

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

export type MigJobDefaults = {
  tax_type_id?: number | null;
  currency_id?: number | null;
  location_id?: number | null;
};

export const MIG_ENTITY_FIELDS: Record<MigKind, string[]> = {
  items: [
    "item_code",
    "item_name",
    "purchase_price",
    "sales_price",
    "vip_price",
    "status",
    "track_serial",
    "track_lot",
    "serial_policy",
    "lot_policy",
    "track_inventory_qty",
    "warranty_duration_months",
    "spec_name",
    "unit",
    "item_category",
    "item_type",
    "oe_price",
  ],
  partners: [
    "partner_code",
    "company_name",
    "partner_kind",
    "ceo_name",
    "phone",
    "mobile",
    "email",
    "address",
    "tin",
    "status",
  ],
  accounts: ["account_code", "account_name", "account_type", "is_group", "is_active", "sort_order"],
  opening_stock: ["item_code", "item", "quantity", "location", "as_of_date"],
  open_si: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "si_dr_no"],
  open_ap: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "vendor_invoice_no"],
  open_po: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"],
  in_transit: ["item_code", "item", "quantity", "from_location", "to_location", "date"],
};

export const MIG_REQUIRED: Record<MigKind, string[]> = {
  items: ["item_name"],
  partners: ["company_name", "partner_kind"],
  accounts: ["account_code", "account_name", "account_type"],
  opening_stock: ["quantity", "location"],
  open_si: ["source_doc_no", "partner", "date", "amount"],
  open_ap: ["source_doc_no", "partner", "date", "amount"],
  open_po: ["source_doc_no", "partner", "date", "item", "quantity"],
  in_transit: ["quantity", "from_location", "to_location"],
};

export const MIG_NEEDS_JOB_DEFAULTS: Record<MigKind, boolean> = {
  items: false,
  partners: false,
  accounts: false,
  opening_stock: false,
  open_si: true,
  open_ap: true,
  open_po: true,
  in_transit: false,
};

const MIG_KIND_PATH: Record<MigKind, string> = {
  items: "/items",
  partners: "/partners",
  accounts: "/accounts",
  opening_stock: "/opening-stock",
  open_si: "/open-si",
  open_ap: "/open-ap",
  open_po: "/open-po",
  in_transit: "/in-transit",
};

const migBase = `${apiBase}/api/v1/migration`;

/** Baiko "map_import_dataset" Approve stages this seed; Migration Center consumes it once. */
export type MigImportSeed = {
  kind: MigKind;
  file_name?: string;
  headers?: string[];
  column_map?: Record<string, string>;
  csv_text?: string;
  truncated?: boolean;
};

export const MIG_IMPORT_SEED_KEY = "bluearm.migImportSeed";

const MIG_KINDS: MigKind[] = [
  "items",
  "partners",
  "accounts",
  "opening_stock",
  "open_si",
  "open_ap",
  "open_po",
  "in_transit",
];

export function takeMigImportSeed(): MigImportSeed | null {
  try {
    const raw = sessionStorage.getItem(MIG_IMPORT_SEED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MIG_IMPORT_SEED_KEY);
    const parsed = JSON.parse(raw) as MigImportSeed;
    if (!parsed || typeof parsed !== "object") return null;
    if (!MIG_KINDS.includes(parsed.kind)) return null;
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

export async function spreadsheetToCsvFile(file: File): Promise<File> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") return file;
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !file.type.includes("sheet") && !file.type.includes("excel")) {
    return file;
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName] ?? {});
  const base = file.name.replace(/\.(xlsx|xls)$/i, "") || "import";
  return new File([csv], `${base}.csv`, { type: "text/csv" });
}

async function postMigMapped(
  kind: MigKind,
  file: File,
  opts: { columnMap: Record<string, string>; job?: MigJobDefaults },
  preview: boolean,
): Promise<ApiResult<MigImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("column_map", JSON.stringify(opts.columnMap));
  if (opts.job?.tax_type_id) fd.append("tax_type_id", String(opts.job.tax_type_id));
  if (opts.job?.currency_id) fd.append("currency_id", String(opts.job.currency_id));
  if (opts.job?.location_id) fd.append("location_id", String(opts.job.location_id));
  const path = `${MIG_KIND_PATH[kind]}/${preview ? "preview-mapped" : "import-mapped"}`;
  const res = await fetch(`${migBase}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<MigImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}

export function previewMigMapped(
  kind: MigKind,
  file: File,
  opts: { columnMap: Record<string, string>; job?: MigJobDefaults },
) {
  return postMigMapped(kind, file, opts, true);
}

export function importMigMapped(
  kind: MigKind,
  file: File,
  opts: { columnMap: Record<string, string>; job?: MigJobDefaults },
) {
  return postMigMapped(kind, file, opts, false);
}
