import { apiBase, getAccessToken, type ApiResult } from "./api";
import { getActiveTenantId, getActiveBranchIdCurrent } from "./activeContext";
import type { CmsMedia } from "./useCms";

export async function cmsAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

export async function uploadCmsMedia(file: File, altText = ""): Promise<ApiResult<CmsMedia>> {
  const fd = new FormData();
  fd.append("file", file);
  if (altText) fd.append("alt_text", altText);
  const res = await fetch(`${apiBase}/api/v1/cms/media`, {
    method: "POST",
    headers: await cmsAuthHeaders(),
    body: fd,
  });
  const body = (await res.json()) as ApiResult<CmsMedia>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function fetchCmsMediaBlob(id: number): Promise<Blob | null> {
  const res = await fetch(`${apiBase}/api/v1/cms/media/${id}/download`, {
    headers: await cmsAuthHeaders(),
  });
  if (!res.ok) return null;
  return res.blob();
}

export async function fetchCmsMediaObjectUrl(id: number): Promise<string | null> {
  const blob = await fetchCmsMediaBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function fetchPublicCmsMediaBlob(id: number): Promise<Blob | null> {
  const res = await fetch(`${apiBase}/api/v1/public/cms/media/${id}/download`);
  if (!res.ok) return null;
  return res.blob();
}

export async function fetchPublicCmsMediaObjectUrl(id: number): Promise<string | null> {
  const blob = await fetchPublicCmsMediaBlob(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function downloadCmsBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
