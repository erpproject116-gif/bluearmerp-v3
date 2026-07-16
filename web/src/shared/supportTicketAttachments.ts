import { apiBase, getAccessToken, type ApiResult } from "./api";
import { getActiveTenantId, getActiveBranchIdCurrent } from "./activeContext";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

export type SupportTicketAttachment = {
  id: number;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
  uploaded_by_user_id?: number | null;
  created_at: string;
};

export async function listSupportTicketAttachments(ticketId: number): Promise<ApiResult<SupportTicketAttachment[]>> {
  const res = await fetch(`${apiBase}/api/v1/support/tickets/${ticketId}/attachments`, {
    headers: await authHeaders(),
  });
  const body = (await res.json()) as ApiResult<SupportTicketAttachment[]>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function uploadSupportTicketAttachment(
  ticketId: number,
  file: File,
): Promise<ApiResult<SupportTicketAttachment>> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiBase}/api/v1/support/tickets/${ticketId}/attachments`, {
    method: "POST",
    headers: await authHeaders(),
    body: fd,
  });
  const body = (await res.json()) as ApiResult<SupportTicketAttachment>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function downloadSupportTicketAttachment(
  ticketId: number,
  attachment: SupportTicketAttachment,
): Promise<boolean> {
  const res = await fetch(
    `${apiBase}/api/v1/support/tickets/${ticketId}/attachments/${attachment.id}/download`,
    { headers: await authHeaders() },
  );
  if (!res.ok) return false;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = attachment.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

export function formatTicketFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
