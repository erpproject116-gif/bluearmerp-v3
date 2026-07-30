import { apiFetch } from "./api";
import type { LookupOption } from "./LookupCombo";

export type AccountRow = {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  is_group?: boolean;
  is_active?: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/**
 * Search the chart of accounts. Defaults to active posting accounts only
 * (excludes group headers). Optionally bias by account_type.
 */
export async function fetchAccountOptions(q: string, accountType?: string): Promise<LookupOption[]> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "40",
    sort: "account_code",
    order: "asc",
    status: "active",
  });
  if (q.trim()) params.set("q", q.trim());
  if (accountType) params.set("account_type", accountType);
  const res = await apiFetch<(AccountRow & { is_group?: boolean })[]>(
    `/api/v1/finance/accounts?${params.toString()}`,
    {},
    { silent: true },
  );
  if (!res.success || !res.data) return [];
  return res.data
    .filter((a) => !a.is_group)
    .map((a) => ({
      id: a.id,
      label: `[${a.account_code}] ${a.account_name}`,
      sublabel: TYPE_LABEL[a.account_type] ?? a.account_type,
    }));
}
