import { apiBase, getAccessToken, type ApiResult } from "./api";
import { getActiveTenantId, getActiveBranchIdCurrent } from "./activeContext";

export type Attachment = {
  id: number;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
  uploaded_by_user_id?: number | null;
  created_at: string;
};

/**
 * Document-scoped attachment endpoints share the same shape across modules.
 * `basePath` is the route segment between /api/v1 and /{id}/attachments, e.g.
 * "quotation/quotations", "sales", "purchase-order/purchase-orders".
 */
export type AttachmentScope =
  | "quotation/quotations"
  | "sales"
  | "sales-order/sales-orders"
  | "purchase-order/purchase-orders"
  | "finance/supplier-invoices"
  | "finance/official-receipts"
  | "finance/payment-vouchers"
  | "inventory/stock-adjustment-requests"
  | "inventory/stock-entries"
  | "manufacturing/work-orders"
  | "support/tickets";

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

export async function listAttachments(scope: AttachmentScope, id: number): Promise<ApiResult<Attachment[]>> {
  const res = await fetch(`${apiBase}/api/v1/${scope}/${id}/attachments`, {
    headers: await authHeaders(),
  });
  const body = (await res.json()) as ApiResult<Attachment[]>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function uploadAttachment(scope: AttachmentScope, id: number, file: File): Promise<ApiResult<Attachment>> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiBase}/api/v1/${scope}/${id}/attachments`, {
    method: "POST",
    headers: await authHeaders(),
    body: fd,
  });
  const body = (await res.json()) as ApiResult<Attachment>;
  return { ...body, status: res.status, ok: res.ok };
}

/** Fetch a stored file with auth and trigger a browser download. */
export async function downloadAttachment(scope: AttachmentScope, id: number, attachment: Attachment): Promise<boolean> {
  const res = await fetch(`${apiBase}/api/v1/${scope}/${id}/attachments/${attachment.id}/download`, {
    headers: await authHeaders(),
  });
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
