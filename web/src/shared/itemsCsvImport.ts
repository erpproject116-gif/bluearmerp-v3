import { apiBase, getAccessToken, type ApiResult } from "./api";

export type ItemsImportResult = {
  created: number;
  failed: number;
  row_errors?: { row: number; message: string }[];
};

const itemsImportBase = `${apiBase}/api/v1/inventory/items`;

export async function downloadItemsImportTemplate() {
  const token = await getAccessToken();
  const res = await fetch(`${itemsImportBase}/import-template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Could not download template.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "items-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importItemsCsv(file: File): Promise<ApiResult<ItemsImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${itemsImportBase}/import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<ItemsImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}
