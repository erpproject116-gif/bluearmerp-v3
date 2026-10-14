import { apiBase, getAccessToken } from "./api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "./activeContext";

export type CustomFieldFileValue = {
  file_id?: number;
  file_name?: string;
  pending?: boolean;
};

const staged = new Map<string, File>();

function stageKey(entityType: string, fieldKey: string) {
  return `${entityType}:${fieldKey}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

export function stageCustomFieldFile(entityType: string, fieldKey: string, file: File | null) {
  const key = stageKey(entityType, fieldKey);
  if (!file) staged.delete(key);
  else staged.set(key, file);
}

export async function uploadCustomFieldFile(
  entityType: string,
  entityId: number,
  fieldKey: string,
  file: File,
): Promise<CustomFieldFileValue | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("entity_type", entityType);
  fd.append("entity_id", String(entityId));
  fd.append("field_key", fieldKey);
  const res = await fetch(`${apiBase}/api/v1/custom-fields/files`, {
    method: "POST",
    headers: await authHeaders(),
    body: fd,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { success?: boolean; data?: CustomFieldFileValue };
  if (!body.success || !body.data?.file_id) return null;
  staged.delete(stageKey(entityType, fieldKey));
  return { file_id: body.data.file_id, file_name: body.data.file_name ?? file.name };
}

export async function flushStagedCustomFiles(
  entityType: string,
  entityId: number,
): Promise<{ ok: boolean; saved: Record<string, CustomFieldFileValue> }> {
  const prefix = `${entityType}:`;
  const saved: Record<string, CustomFieldFileValue> = {};
  let ok = true;
  for (const [key, file] of [...staged.entries()]) {
    if (!key.startsWith(prefix)) continue;
    const fieldKey = key.slice(prefix.length);
    const stored = await uploadCustomFieldFile(entityType, entityId, fieldKey, file);
    if (!stored) ok = false;
    else saved[fieldKey] = stored;
  }
  return { ok, saved };
}

export async function openCustomFieldFile(fileId: number): Promise<void> {
  const res = await fetch(`${apiBase}/api/v1/custom-fields/files/${fileId}/download`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return;
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
