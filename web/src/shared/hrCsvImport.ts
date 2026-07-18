import { apiBase, getAccessToken, type ApiResult } from "./api";

export type HrImportResult = {
  created: number;
  updated?: number;
  failed: number;
  row_errors?: { row: number; message: string }[];
};

const hrBase = `${apiBase}/api/v1/hr`;

async function downloadCsv(path: string, filename: string) {
  const token = await getAccessToken();
  const res = await fetch(`${hrBase}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Could not download file.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function importCsv(path: string, file: File): Promise<ApiResult<HrImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${hrBase}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<HrImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}

export function downloadEmployeesImportTemplate() {
  return downloadCsv("/employees/import-template.csv", "employees-import-template.csv");
}

export function exportEmployeesCsv(q?: string, status?: string) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return downloadCsv(`/employees/export.csv${suffix}`, "employees-export.csv");
}

export function importEmployeesCsv(file: File) {
  return importCsv("/employees/import", file);
}

export function downloadDtrImportTemplate() {
  return downloadCsv("/dtr/import-template.csv", "dtr-import-template.csv");
}

export function importDtrCsv(file: File) {
  return importCsv("/dtr/import", file);
}

export type HrImportProfile = {
  id: number;
  kind: "employees" | "dtr";
  name: string;
  column_map: Record<string, string>;
};

export async function listHrImportProfiles(kind: "employees" | "dtr"): Promise<ApiResult<HrImportProfile[]>> {
  const token = await getAccessToken();
  const res = await fetch(`${hrBase}/import-profiles?kind=${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = (await res.json()) as ApiResult<HrImportProfile[]>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function upsertHrImportProfile(
  kind: "employees" | "dtr",
  name: string,
  columnMap: Record<string, string>,
): Promise<ApiResult<HrImportProfile>> {
  const token = await getAccessToken();
  const res = await fetch(`${hrBase}/import-profiles`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind, name, column_map: columnMap }),
  });
  const body = (await res.json()) as ApiResult<HrImportProfile>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function importEmployeesMapped(
  file: File,
  opts: { profileId?: number; columnMap?: Record<string, string> },
): Promise<ApiResult<HrImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  if (opts.profileId) fd.append("profile_id", String(opts.profileId));
  if (opts.columnMap) fd.append("column_map", JSON.stringify(opts.columnMap));
  const res = await fetch(`${hrBase}/employees/import-mapped`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<HrImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function importDtrMapped(
  file: File,
  opts: { profileId?: number; columnMap?: Record<string, string> },
): Promise<ApiResult<HrImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  if (opts.profileId) fd.append("profile_id", String(opts.profileId));
  if (opts.columnMap) fd.append("column_map", JSON.stringify(opts.columnMap));
  const res = await fetch(`${hrBase}/dtr/import-mapped`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<HrImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}

export function exportPayrollRegisterCsv(payPeriodId: number) {
  return downloadCsv(`/pay-periods/${payPeriodId}/register.csv`, `payroll-register-${payPeriodId}.csv`);
}

export function exportRemittanceCsv(batchId: number, format?: string) {
  const qs = format ? `?format=${encodeURIComponent(format)}` : "";
  const name = format ? `${format}-remittance-${batchId}.csv` : `remittance-${batchId}.csv`;
  return downloadCsv(`/remittances/${batchId}/export.csv${qs}`, name);
}
