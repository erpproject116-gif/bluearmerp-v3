import { apiBase, getAccessToken, type ApiResult } from "./api";
import { getActiveTenantId } from "./activeContext";
import { MIG_ENTITY_FIELDS } from "./migrationCsvImport";

export type CsvImportCounts = {
  created: number;
  updated?: number;
  skipped?: number;
  failed: number;
  row_errors?: { row: number; message: string }[];
};

async function authHeaders(): Promise<Headers> {
  const headers = new Headers();
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const tenantId = getActiveTenantId();
  if (tenantId) headers.set("X-Tenant-ID", String(tenantId));
  return headers;
}

async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${apiBase}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("Could not download template.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function postCsv(path: string, file: File, columnMap?: Record<string, string>): Promise<ApiResult<CsvImportCounts>> {
  const headers = await authHeaders();
  const fd = new FormData();
  fd.append("file", file);
  if (columnMap) fd.append("column_map", JSON.stringify(columnMap));
  const res = await fetch(`${apiBase}${path}`, { method: "POST", headers, body: fd });
  const body = (await res.json()) as ApiResult<CsvImportCounts>;
  return { ...body, status: res.status, ok: res.ok };
}

const partnerColumnMap = Object.fromEntries(MIG_ENTITY_FIELDS.partners.map((field) => [field, field]));

export function downloadPartnerImportTemplate() {
  return downloadCsv("/api/v1/inventory/partners/import-template", "mig-partners-import-template.csv");
}

export function importPartnersCsv(file: File) {
  return postCsv("/api/v1/inventory/partners/import", file, partnerColumnMap);
}

export function downloadLocationImportTemplate() {
  return downloadCsv("/api/v1/inventory/locations/import-template", "locations-import-template.csv");
}

export function importLocationsCsv(file: File) {
  return postCsv("/api/v1/inventory/locations/import", file);
}
