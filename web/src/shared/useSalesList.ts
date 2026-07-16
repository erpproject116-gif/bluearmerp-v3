import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SalesListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  progressStatus?: string;
  invoicingStatus?: string;
};

export type SalesRow = {
  id: number;
  order_date: string;
  date_seq: number;
  date_no_display: string;
  sales_no: string;
  tax_type_id: number;
  tax_type_name: string;
  currency_id: number;
  currency_code: string;
  partner_id: number;
  customer_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  location_name?: string;
  due_date?: string | null;
  payment_terms?: string | null;
  si_dr_no?: string | null;
  progress_status: string;
  invoicing_status: boolean;
  grand_total: number;
  created_by_name?: string;
  item_name_summary?: string;
};

export function useSalesList(params: () => SalesListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);
    if (p.progressStatus) qs.set("progress_status", p.progressStatus);
    if (p.invoicingStatus) qs.set("invoicing_status", p.invoicingStatus);

    return {
      queryKey: ["sales", p],
      queryFn: async () => {
        const res = await apiFetch<SalesRow[]>(`/api/v1/sales?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidateSales() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales"] });
}

export async function patchSalesProgress(salesId: number, progressStatus: string) {
  return apiFetch(`/api/v1/sales/${salesId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}

export async function patchSalesInvoicing(salesId: number, invoicingStatus: boolean) {
  return apiFetch(`/api/v1/sales/${salesId}/invoicing-status`, {
    method: "PATCH",
    body: JSON.stringify({ invoicing_status: invoicingStatus }),
  });
}
