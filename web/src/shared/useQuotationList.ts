import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type QuotationListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  progressStatus?: string;
  lifecycle?: string;
};

export type QuotationRow = {
  id: number;
  order_date: string;
  date_seq: number;
  date_no_display: string;
  reference_no: string;
  tax_type_id: number;
  tax_type_name: string;
  currency_id: number;
  currency_code: string;
  partner_id: number;
  customer_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  progress_status: string;
  valid_until?: string | null;
  quotation_validity_text?: string | null;
  grand_total: number;
  created_by_name?: string;
  item_name_summary?: string;
  voucher_status?: string;
};

export function useQuotationList(params: () => QuotationListParams) {
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
    if (p.lifecycle && p.lifecycle !== "active") qs.set("lifecycle", p.lifecycle);

    return {
      queryKey: ["quotations", p],
      queryFn: async () => {
        const res = await apiFetch<QuotationRow[]>(`/api/v1/quotation/quotations?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 0,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidateQuotations() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["quotations"] });
}

export async function patchQuotationProgress(quotationId: number, progressStatus: string) {
  return apiFetch(`/api/v1/quotation/quotations/${quotationId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
