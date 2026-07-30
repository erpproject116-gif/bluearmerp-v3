import { apiBase, getAccessToken, type ApiResult } from "./api";

export type BankStatementImportResult = {
  created: number;
  failed: number;
  row_errors?: { row: number; message: string }[];
};

const importBase = `${apiBase}/api/v1/finance/bank-reconciliation/statement-lines`;

export async function downloadBankStatementImportTemplate() {
  const token = await getAccessToken();
  const res = await fetch(`${importBase}/import-template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Could not download template.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bank-statement-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBankStatementCsv(
  file: File,
  bankAccountId?: string,
): Promise<ApiResult<BankStatementImportResult>> {
  const token = await getAccessToken();
  const fd = new FormData();
  fd.append("file", file);
  if (bankAccountId) {
    fd.append("bank_account_id", bankAccountId);
  }
  const res = await fetch(`${importBase}/import`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const body = (await res.json()) as ApiResult<BankStatementImportResult>;
  return { ...body, status: res.status, ok: res.ok };
}
