import {
  apiAbsoluteUrl,
  getAccessToken,
} from "../api";
import { getActiveTenantId, getActiveBranchIdCurrent } from "../activeContext";

/** Authenticated GET for binary/text downloads (CSV, MD, etc.). Uses production API base. */
export async function downloadApiFile(url: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) headers.set("X-Tenant-ID", String(activeTenantId));
  const activeBranchId = getActiveBranchIdCurrent();
  if (activeBranchId) headers.set("X-Branch-ID", String(activeBranchId));

  let res: Response;
  try {
    res = await fetch(apiAbsoluteUrl(url), { headers, cache: "no-store" });
  } catch {
    return { ok: false, error: "network" };
  }
  if (!res.ok) {
    return { ok: false, error: `http_${res.status}` };
  }
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  // SPA hosts often return index.html with 200 for unknown /api paths.
  if (ct.includes("text/html")) {
    return { ok: false, error: "html" };
  }
  const blob = await res.blob();
  const head = await blob.slice(0, 32).text();
  if (/^\s*<(!doctype|html)\b/i.test(head)) {
    return { ok: false, error: "html" };
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return { ok: true };
}

export async function downloadReportCsv(url: string, filename: string) {
  await downloadApiFile(url, filename);
}

/** RFC 4180 CSV → array-of-arrays (handles quoted multiline cells). */
export function parseCsvToAoa(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0) || r.length > 1);
}

/** Fetch export body as text (e.g. CSV → Excel conversion). */
export async function fetchApiText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) headers.set("X-Tenant-ID", String(activeTenantId));
  const activeBranchId = getActiveBranchIdCurrent();
  if (activeBranchId) headers.set("X-Branch-ID", String(activeBranchId));

  let res: Response;
  try {
    res = await fetch(apiAbsoluteUrl(url), { headers, cache: "no-store" });
  } catch {
    return { ok: false, error: "network" };
  }
  if (!res.ok) return { ok: false, error: `http_${res.status}` };
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const text = await res.text();
  if (ct.includes("text/html") || /^\s*<(!doctype|html)\b/i.test(text)) {
    return { ok: false, error: "html" };
  }
  return { ok: true, text };
}
