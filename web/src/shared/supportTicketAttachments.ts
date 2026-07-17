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

async function fetchAttachmentBlob(
  ticketId: number,
  attachment: SupportTicketAttachment,
): Promise<Blob | null> {
  const res = await fetch(
    `${apiBase}/api/v1/support/tickets/${ticketId}/attachments/${attachment.id}/download`,
    { headers: await authHeaders() },
  );
  if (!res.ok) return null;
  return res.blob();
}

export async function downloadSupportTicketAttachment(
  ticketId: number,
  attachment: SupportTicketAttachment,
): Promise<boolean> {
  const blob = await fetchAttachmentBlob(ticketId, attachment);
  if (!blob) return false;
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

const PREVIEWABLE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
  ".pdf", ".txt", ".csv", ".md",
  ".mp4", ".webm", ".mov", ".mp3", ".m4a",
];

export function canPreviewSupportTicketAttachment(attachment: SupportTicketAttachment): boolean {
  const mime = (attachment.mime_type ?? "").toLowerCase();
  if (
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/")
  ) {
    return true;
  }
  const name = attachment.file_name.toLowerCase();
  return PREVIEWABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Opens the attachment in a new browser tab (browser renders images, PDFs, videos, etc.). */
export async function previewSupportTicketAttachment(
  ticketId: number,
  attachment: SupportTicketAttachment,
): Promise<boolean> {
  const blob = await fetchAttachmentBlob(ticketId, attachment);
  if (!blob) return false;
  // Re-type the blob so the browser renders it instead of downloading
  // (the server may have stored a generic octet-stream mime).
  const mime = attachment.mime_type || blob.type || "application/octet-stream";
  const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
  const objectUrl = URL.createObjectURL(typed);
  const win = window.open(objectUrl, "_blank", "noopener");
  // Give the tab time to load before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return win != null;
}

export function formatTicketFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
