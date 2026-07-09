import { createQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LoadingText } from "../../../shared/LoadingText";

type CreditBalanceRow = {
  partner_id: number;
  customer_name: string;
  credit_limit: number | null;
  credit_on_hold: boolean;
  open_ar_balance: number;
  available_credit: number | null;
};

export default function CustomerCreditBalancePage() {
  const report = createQuery(() => ({
    queryKey: ["customer-credit-balance"],
    queryFn: async () => {
      const res = await apiFetch<CreditBalanceRow[]>(
        "/api/v1/sales/reports/customer-credit-balance?page=1&pageSize=100",
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div class="space-y-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Customer Credit Balance</h1>
        <p class="mt-1 text-sm text-slate-600">
          Open A/R balance vs credit limit per customer (same receipt-application logic as A/R by Customer).
        </p>
      </div>

      <Show when={!report.isLoading} fallback={<LoadingText class="text-sm text-slate-500" as="p" />}>
        <table class="min-w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Customer</th>
              <th class="px-3 py-2 text-right">Credit limit</th>
              <th class="px-3 py-2 text-right">Open A/R</th>
              <th class="px-3 py-2 text-right">Available</th>
              <th class="px-3 py-2 text-left">Hold</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data ?? []}>
              {(row) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-right">{fmt(row.credit_limit)}</td>
                  <td class="px-3 py-2 text-right">{fmt(row.open_ar_balance)}</td>
                  <td class={`px-3 py-2 text-right ${row.available_credit != null && row.available_credit < 0 ? "text-red-700 font-medium" : ""}`}>
                    {fmt(row.available_credit)}
                  </td>
                  <td class="px-3 py-2">{row.credit_on_hold ? "Yes" : "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
