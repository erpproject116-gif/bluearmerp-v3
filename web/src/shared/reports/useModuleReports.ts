import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../api";

export type DateRangeFilters = {
  date_from?: string;
  date_to?: string;
};

export type ReportParams<F> = {
  filters: F;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
  /** Increment on each Run Report so identical filters still refetch. */
  runId?: number;
};

function reportQs(
  filters: Record<string, string | number | null | undefined>,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function exportUrl(path: string, filters: Record<string, string | number | null | undefined>): string {
  return `${path}?${reportQs(filters)}`;
}

// --- SO Analysis ---

export type SOAnalysisRow = {
  partner_id: number;
  customer_name: string;
  order_count: number;
  unconfirmed_count: number;
  in_progress_count: number;
  completed_count: number;
  total_amount: number;
};

export function soAnalysisExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/sales-order/reports/so-analysis/export", filters);
}

export function useSOAnalysisReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-so-analysis", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<SOAnalysisRow[]>(`/api/v1/sales-order/reports/so-analysis?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

// --- Fulfillment Progress ---

export type FulfillmentProgressRow = {
  sales_order_id: number;
  sales_order_no: string;
  order_date: string;
  customer_name: string;
  progress_status: string;
  pct_delivered: number;
  pct_billed: number;
  grand_total: number;
};

export type FulfillmentProgressSummary = {
  fully_delivered: number;
  partially_delivered: number;
  not_delivered: number;
  fully_billed: number;
  partially_billed: number;
  not_billed: number;
};

type FulfillmentProgressPayload = {
  rows: FulfillmentProgressRow[];
  summary: FulfillmentProgressSummary;
  total: number;
  page: number;
  page_size: number;
};

export function fulfillmentProgressExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/sales-order/reports/fulfillment-progress/export", filters);
}

export function useFulfillmentProgressReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-fulfillment-progress", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<FulfillmentProgressPayload>(
          `/api/v1/sales-order/reports/fulfillment-progress?${qs}`,
        );
        if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data.rows ?? [],
          summary: res.data.summary,
          total: res.data.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- PO Analysis ---

export type POAnalysisRow = {
  partner_id: number;
  vendor_name: string;
  order_count: number;
  confirmed_count: number;
  partial_count: number;
  received_count: number;
  total_amount: number;
};

export function poAnalysisExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/purchase-order/reports/po-analysis/export", filters);
}

export function usePOAnalysisReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-po-analysis", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<POAnalysisRow[]>(`/api/v1/purchase-order/reports/po-analysis?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

// --- Items to Receive ---

export type ItemsToReceiveRow = {
  purchase_order_id: number;
  purchase_order_no: string;
  order_date: string;
  vendor_name: string;
  line_id: number;
  item_code: string;
  item_name: string;
  order_qty: number;
  received_qty: number;
  pending_qty: number;
};

export function itemsToReceiveExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/purchase-order/reports/items-to-receive/export", filters);
}

export function useItemsToReceiveReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-items-to-receive", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ItemsToReceiveRow[]>(`/api/v1/purchase-order/reports/items-to-receive?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

// --- Stock Balance ---

export type StockBalanceRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  qty_reserved: number;
  available_qty: number;
};

export function stockBalanceExportUrl(): string {
  return "/api/v1/inventory/reports/stock-balance/export";
}

export function useStockBalanceReport(params: () => Omit<ReportParams<Record<string, never>>, "filters"> & { filters?: Record<string, never> }) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs({}, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-stock-balance", p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<StockBalanceRow[]>(`/api/v1/inventory/reports/stock-balance?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
    };
  });
}

// --- Stock Ledger ---

export type InvBookFilters = DateRangeFilters & {
  q?: string;
  item_id?: number;
  location_id?: number;
};

export type StockLedgerFilters = DateRangeFilters & {
  q?: string;
  item_id?: number;
  location_id?: number;
};

export type StockLedgerRow = {
  id: number;
  created_at: string;
  item_code: string;
  item_name: string;
  location_name: string;
  qty_delta: number;
  running_balance: number;
  movement_type: string;
  ref_type: string;
  ref_id?: number | null;
  reason?: string;
};

export function stockLedgerExportUrl(filters: StockLedgerFilters): string {
  return exportUrl("/api/v1/inventory/reports/stock-ledger/export", filters);
}

export function useStockLedgerReport(params: () => ReportParams<StockLedgerFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-stock-ledger", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<StockLedgerRow[]>(`/api/v1/inventory/reports/stock-ledger?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
    };
  });
}

// --- Stock Ageing ---

export type StockAgeingRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  last_movement_at: string;
  age_days: number;
  age_bucket: string;
};

export function stockAgeingExportUrl(): string {
  return "/api/v1/inventory/reports/stock-ageing/export";
}

export function useStockAgeingReport(params: () => Omit<ReportParams<Record<string, never>>, "filters">) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs({}, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-stock-ageing", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<StockAgeingRow[]>(`/api/v1/inventory/reports/stock-ageing?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

// --- On Hand (Inventory Balance) ---

export type OnHandFilters = {
  as_of?: string;
  min_qty?: number;
  max_qty?: number;
  below_safety?: boolean;
  safety_doc_type?: string;
  item_id?: number;
  location_id?: number;
};

export type OnHandRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  qty_reserved: number;
  reorder_level?: number;
  below_safety: boolean;
};

export function onHandExportUrl(filters: OnHandFilters): string {
  return exportUrl("/api/v1/inventory/reports/on-hand/export", {
    ...filters,
    below_safety: filters.below_safety ? "true" : undefined,
  } as Record<string, string | number | null | undefined>);
}

export function useOnHandReport(params: () => ReportParams<OnHandFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(
      {
        ...p.filters,
        below_safety: p.filters.below_safety ? "true" : undefined,
      } as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-on-hand", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<OnHandRow[]>(`/api/v1/inventory/reports/on-hand?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
    };
  });
}

// --- Inventory Status ---

export type InventoryStatusFilters = {
  q?: string;
  status?: string;
  category_id?: number;
  location_id?: number;
  branch_id?: number;
  in_stock_only?: number | boolean;
  /** When "matrix", API pages by item and returns all branch rows for those items. */
  view?: "matrix" | string;
};

export type InventoryStatusRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  item_status: string;
  unit_code?: string;
  category_id?: number | null;
  category_name: string;
  spec_name?: string;
  location_id: number;
  location_name: string;
  branch_name: string;
  qty_on_hand: number;
  qty_reserved: number;
  available_qty: number;
  purchase_price?: number;
  vip_price?: number;
  sales_price: number;
  company_available_qty: number;
  reorder_level?: number;
  stock_status: string;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_unit_count?: number;
  lot_batch_count?: number;
  last_sold_at?: string | null;
  last_sold_by: string;
  last_sold_ref_type: string;
  last_sold_ref_id?: number | null;
  last_movement_at?: string | null;
  last_movement_type: string;
};

export function inventoryStatusExportUrl(filters: InventoryStatusFilters): string {
  return exportUrl("/api/v1/inventory/reports/inventory-status/export", filters as Record<string, string | number>);
}

export function useInventoryStatusReport(params: () => ReportParams<InventoryStatusFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-inventory-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<InventoryStatusRow[]>(`/api/v1/inventory/reports/inventory-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load inventory status");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    };
  });
}

// --- Inv. Book ---

export type InvBookRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  opening_qty: number;
  receipt_qty: number;
  issue_qty: number;
  closing_qty: number;
  purchase_price: number;
  sales_price: number;
  vip_price: number;
};

export function invBookExportUrl(filters: InvBookFilters): string {
  return exportUrl("/api/v1/inventory/reports/inv-book/export", filters as Record<string, string | number>);
}

export function useInvBookReport(params: () => ReportParams<InvBookFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-inv-book", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<InvBookRow[]>(`/api/v1/inventory/reports/inv-book?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
    };
  });
}

export type InvBookSlipFilters = DateRangeFilters & {
  item_id: number;
  location_id?: number;
};

export type InvBookSlipRow = {
  id: number;
  is_beginning?: boolean;
  created_at: string;
  partner_name: string;
  remark: string;
  increase_qty: number;
  release_qty: number;
  inventory_qty: number;
  serial_lot_nos: string;
  location_name: string;
  location_id?: number | null;
  movement_type?: string;
  ref_type?: string;
  ref_id?: number | null;
  item_code?: string;
  item_name?: string;
};

export function useInvBookSlips(params: () => ReportParams<InvBookSlipFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-inv-book-slips", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled && p.filters.item_id > 0,
      queryFn: async () => {
        const res = await apiFetch<InvBookSlipRow[]>(`/api/v1/inventory/reports/inv-book/slips?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load inv. book");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 0,
    };
  });
}

// --- AR/AP Status ---

export type ArApStatusFilters = {
  as_of: string;
  status_type: "combined" | "receivable" | "payable";
  partner_id?: number;
};

export type ArApStatusRow = {
  partner_id: number;
  partner_name: string;
  partner_kind: string;
  ar_balance: number;
  ap_balance: number;
  net_balance: number;
};

export function arApStatusExportUrl(filters: ArApStatusFilters): string {
  return exportUrl("/api/v1/finance/reports/ar-ap-status/export", filters);
}

export function useArApStatusReport(params: () => ReportParams<ArApStatusFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-ar-ap-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ArApStatusRow[]>(`/api/v1/finance/reports/ar-ap-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

// --- Acct vs Inventory reconciliation ---

export type AcctInventoryReconSummary = {
  acct_closing_balance: number;
  inv_closing_valuation: number;
  closing_difference: number;
  acct_period_net: number;
  inv_period_net: number;
  period_difference: number;
};

export type AcctInventoryReconAccountRow = {
  account_code: string;
  account_name: string;
  period_debit: number;
  period_credit: number;
  period_net: number;
  closing_balance: number;
};

export type AcctInventoryReconPayload = {
  summary: AcctInventoryReconSummary;
  accounts: AcctInventoryReconAccountRow[];
};

export function acctInventoryReconExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/finance/reports/acct-inventory-reconciliation/export", filters);
}

export function useAcctInventoryReconciliationReport(params: () => { filters: DateRangeFilters; enabled: boolean }) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number>, {
      page: 1,
      pageSize: 1,
      sort: "",
      order: "asc",
    });
    return {
      queryKey: ["report-acct-inventory-recon", p.filters],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<AcctInventoryReconPayload>(
          `/api/v1/finance/reports/acct-inventory-reconciliation?${qs}`,
        );
        if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load reconciliation");
        return res.data;
      },
      staleTime: 15_000,
    };
  });
}

// --- Trial Balance ---

export type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
};

type TrialBalancePayload = { rows: TrialBalanceRow[]; has_journal_data: boolean };

export function trialBalanceExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/finance/reports/trial-balance/export", filters);
}

export function useTrialBalanceReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-trial-balance", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<TrialBalancePayload | TrialBalanceRow[]>(`/api/v1/finance/reports/trial-balance?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        const data = res.data;
        if (Array.isArray(data)) {
          return { rows: data, total: res.meta?.total ?? 0, hasJournalData: true };
        }
        return {
          rows: data?.rows ?? [],
          total: res.meta?.total ?? 0,
          hasJournalData: data?.has_journal_data ?? false,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- General Ledger ---

export type GeneralLedgerRow = {
  entry_date: string;
  entry_no: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  party_name?: string;
  remarks?: string;
};

type GeneralLedgerPayload = { rows: GeneralLedgerRow[]; has_journal_data: boolean };

export function generalLedgerExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/finance/reports/general-ledger/export", filters);
}

export function useGeneralLedgerReport(params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["report-general-ledger", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<GeneralLedgerPayload | GeneralLedgerRow[]>(`/api/v1/finance/reports/general-ledger?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        const data = res.data;
        if (Array.isArray(data)) {
          return { rows: data, total: res.meta?.total ?? 0, hasJournalData: true };
        }
        return {
          rows: data?.rows ?? [],
          total: res.meta?.total ?? 0,
          hasJournalData: data?.has_journal_data ?? false,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Profit & Loss / Balance Sheet ---

export type FinancialStatementRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  amount: number;
};

type FinancialStatementPayload = {
  rows: FinancialStatementRow[];
  total_amount: number;
  has_journal_data: boolean;
};

function useFinancialStatementReport(endpoint: string, queryKey: string, params: () => ReportParams<DateRangeFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: [queryKey, p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<FinancialStatementPayload | FinancialStatementRow[]>(
          `/api/v1/finance/reports/${endpoint}?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        const data = res.data;
        if (Array.isArray(data)) {
          return { rows: data, total: res.meta?.total ?? 0, totalAmount: 0, hasJournalData: true };
        }
        return {
          rows: data?.rows ?? [],
          total: res.meta?.total ?? 0,
          totalAmount: data?.total_amount ?? 0,
          hasJournalData: data?.has_journal_data ?? false,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useProfitAndLossReport(params: () => ReportParams<DateRangeFilters>) {
  return useFinancialStatementReport("profit-and-loss", "report-profit-and-loss", params);
}

export function useBalanceSheetReport(params: () => ReportParams<DateRangeFilters>) {
  return useFinancialStatementReport("balance-sheet", "report-balance-sheet", params);
}

export function profitAndLossExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/finance/reports/profit-and-loss/export", filters);
}

export function balanceSheetExportUrl(filters: DateRangeFilters): string {
  return exportUrl("/api/v1/finance/reports/balance-sheet/export", filters);
}

// --- A/R & A/P Aging ---

export type AgingFilters = {
  as_of?: string;
};

export type AgingSummary = {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total: number;
};

export type ArAgingRow = {
  sales_id: number;
  sales_no: string;
  customer_name: string;
  due_date: string;
  balance: number;
  age_days: number;
  age_bucket: string;
};

export type ApAgingRow = {
  supplier_invoice_id: number;
  invoice_no: string;
  vendor_name: string;
  due_date: string;
  balance: number;
  age_days: number;
  age_bucket: string;
};

type AgingPayload<T> = {
  rows: T[];
  summary: AgingSummary;
};

function useAgingReport<T>(endpoint: string, key: string, params: () => ReportParams<AgingFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: [key, p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<AgingPayload<T>>(`/api/v1/finance/${endpoint}?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total: 0 },
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function arAgingExportUrl(filters: AgingFilters): string {
  return exportUrl("/api/v1/finance/ar-aging/export", filters);
}

export function apAgingExportUrl(filters: AgingFilters): string {
  return exportUrl("/api/v1/finance/ap-aging/export", filters);
}

export function useArAgingReport(params: () => ReportParams<AgingFilters>) {
  return useAgingReport<ArAgingRow>("ar-aging", "report-ar-aging", params);
}

export function useApAgingReport(params: () => ReportParams<AgingFilters>) {
  return useAgingReport<ApAgingRow>("ap-aging", "report-ap-aging", params);
}

// --- Workspaces ---

export type InventoryWorkspaceSummary = {
  active_items: number;
  active_locations: number;
  items_with_stock: number;
  low_stock_skus: number;
  negative_stock_skus: number;
  open_stock_entries: number;
};

export function useInventoryWorkspace() {
  return createQuery(() => ({
    queryKey: ["inventory-workspace"],
    queryFn: async () => {
      const res = await apiFetch<InventoryWorkspaceSummary>("/api/v1/inventory/workspace");
      if (!res.success) throw new Error(res.message ?? "Failed to load workspace");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export type LowStockAlertRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  reorder_level: number;
  shortfall: number;
};

export function useLowStockAlerts() {
  return createQuery(() => ({
    queryKey: ["inventory-low-stock-alerts"],
    queryFn: async () => {
      const res = await apiFetch<LowStockAlertRow[]>("/api/v1/inventory/workspace/low-stock-alerts?limit=15");
      if (!res.success) throw new Error(res.message ?? "Failed to load alerts");
      return res.data ?? [];
    },
    staleTime: 30_000,
  }));
}

export type BuyingWorkspaceSummary = {
  open_purchase_orders: number;
  open_rfq: number;
  pending_receipt_rows: number;
  unpaid_invoices: number;
};

export function useBuyingWorkspace() {
  return createQuery(() => ({
    queryKey: ["buying-workspace"],
    queryFn: async () => {
      const res = await apiFetch<BuyingWorkspaceSummary>("/api/v1/buying/workspace");
      if (!res.success) throw new Error(res.message ?? "Failed to load workspace");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export type SellingWorkspaceSummary = {
  open_sales_orders: number;
  open_quotations: number;
  expired_quotations: number;
  pending_delivery_lines: number;
  low_stock_skus: number;
};

export function useSellingWorkspace() {
  return createQuery(() => ({
    queryKey: ["selling-workspace"],
    queryFn: async () => {
      const res = await apiFetch<SellingWorkspaceSummary>("/api/v1/selling/workspace");
      if (!res.success) throw new Error(res.message ?? "Failed to load workspace");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export type FinanceWorkspaceSummary = {
  ar_customers: number;
  unpaid_supplier_invoices: number;
  draft_journal_entries: number;
  unmatched_bank_lines: number;
  ap_over_application: number;
};

export function useFinanceWorkspace() {
  return createQuery(() => ({
    queryKey: ["finance-workspace"],
    queryFn: async () => {
      const res = await apiFetch<FinanceWorkspaceSummary>("/api/v1/finance/workspace");
      if (!res.success) throw new Error(res.message ?? "Failed to load workspace");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export type BooksHealthException = {
  code: string;
  severity: "block" | "warn" | string;
  count: number;
  label: string;
  href: string;
};

export type BooksHealthSummary = {
  as_of: string;
  ready_to_close: boolean;
  draft_journal_entries: number;
  unmatched_bank_lines: number;
  audit_only_pending: number;
  credits_missing_je: number;
  credit_notes_missing_je: number;
  vendor_credits_missing_je: number;
  ar_customers: number;
  unpaid_supplier_invoices: number;
  ap_over_application: number;
  sales_unbilled_lines: number;
  purchase_unbilled_gr_lines: number;
  inventory_closing_difference: number;
  hybrid_inventory_unmapped: boolean;
  policies: {
    accounts_auto_post_or: boolean;
    accounts_auto_post_pv: boolean;
    accounts_auto_post_sales: boolean;
    accounts_auto_post_purchase: boolean;
    inventory_gl_hybrid_enabled: boolean;
  };
  fiscal: {
    period_id?: number;
    period_code?: string;
    is_closed: boolean;
    year_code?: string;
  };
  exceptions: BooksHealthException[];
  signoff_links: Record<string, string>;
};

export function useBooksHealth(asOf?: () => string) {
  return createQuery(() => {
    const day = asOf?.() ?? "";
    const qs = day ? `?as_of=${encodeURIComponent(day)}` : "";
    return {
      queryKey: ["finance-books-health", day || "today"],
      queryFn: async () => {
        const res = await apiFetch<BooksHealthSummary>(`/api/v1/finance/books-health${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load books health");
        return res.data!;
      },
      staleTime: 30_000,
    };
  });
}
