import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import {
  filtersToSearchParams,
  type CollectiveInvoiceStatusFilters,
} from "../modules/sales/collective-invoicing/collectiveInvoiceStatusFilters";
import type { CollectiveInvoiceStatusTemplate } from "../modules/sales/collective-invoicing/collectiveInvoiceStatusTemplate";

export type CollectiveInvoiceStatusRow = {
  id: number;
  invoice_date: string;
  date_no_display: string;
  receivable_no: string;
  customer_name: string;
  pretax_amount: number;
  sales_tax: number;
  total_sales: number;
  due_date?: string;
  status: string;
  accounting_slip_no?: string;
};

export type CollectiveInvoiceStatusParams = {
  filters: CollectiveInvoiceStatusFilters;
  template: CollectiveInvoiceStatusTemplate;
  page: number;
  pageSize: number;
  enabled: boolean;
};

export function collectiveInvoiceStatusExportUrl(
  filters: CollectiveInvoiceStatusFilters,
  template?: CollectiveInvoiceStatusTemplate,
): string {
  const qs = filtersToSearchParams(filters, {
    sort: template?.sortField ?? "invoice_date",
    order: template?.sortOrder ?? "desc",
    sort2: template?.sortField2 || undefined,
    order2: template?.sortField2 ? template.sortOrder2 : undefined,
  });
  return `/api/v1/sales/collective-invoice-status-report/export?${qs}`;
}

export function useCollectiveInvoiceStatusReport(params: () => CollectiveInvoiceStatusParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.template.sortField,
      order: p.template.sortOrder,
      sort2: p.template.sortField2 || undefined,
      order2: p.template.sortField2 ? p.template.sortOrder2 : undefined,
    });
    return {
      queryKey: ["collective-invoice-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: CollectiveInvoiceStatusRow[];
          summary: { total_pretax: number; total_tax: number; total_sales: number };
        }>(`/api/v1/sales/collective-invoice-status-report?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load invoice status");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_pretax: 0, total_tax: 0, total_sales: 0 },
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateCollectiveInvoiceStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["collective-invoice-status"] });
}
