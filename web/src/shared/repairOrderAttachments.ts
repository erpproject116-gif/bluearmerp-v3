import { apiBase, getAccessToken, type ApiResult } from "./api";

export type RepairOrderAttachment = {
  id: number;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
  uploaded_by_user_id?: number | null;
  created_at: string;
};

export async function listRepairOrderAttachments(orderId: number): Promise<ApiResult<RepairOrderAttachment[]>> {
  const res = await fetch(`${apiBase}/api/v1/inventory/repair-orders/${orderId}/attachments`, {
    headers: { Authorization: `Bearer ${(await getAccessToken()) ?? ""}` },
  });
  const body = (await res.json()) as ApiResult<RepairOrderAttachment[]>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function uploadRepairOrderAttachment(orderId: number, file: File): Promise<ApiResult<RepairOrderAttachment>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiBase}/api/v1/inventory/repair-orders/${orderId}/attachments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<RepairOrderAttachment>;
  return { ...body, status: res.status, ok: res.ok };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
