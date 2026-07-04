import { apiFetch } from "./api";
import type { LookupOption } from "./LookupCombo";

export type AccountRow = {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
};

/**
 * Search the chart of accounts. Optionally bias by account_type
 * (e.g. "income" for the Sales account, "expense" for the Purchase account).
 */
export async function fetchAccountOptions(q: string, accountType?: string): Promise<LookupOption[]> {
  const params = new URLSearchParams({ per_page: "30", sort: "account_code", order: "asc" });
  if (q.trim()) params.set("q", q.trim());
  if (accountType) params.set("account_type", accountType);
  const res = await apiFetch<AccountRow[]>(`/api/v1/finance/accounts?${params.toString()}`, {}, { silent: true });
  if (!res.success || !res.data) return [];
  return res.data.map((a) => ({
    id: a.id,
    label: `[${a.account_code}] ${a.account_name}`,
    sublabel: a.account_type,
  }));
}
