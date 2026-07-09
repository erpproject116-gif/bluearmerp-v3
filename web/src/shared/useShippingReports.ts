import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ShippingReportFilters = {
  date_from: string;
  date_to: string;
  location_id?: number | null;
  partner_id?: number | null;
  item_id?: number | null;
  status?: string;
  sales_order_id?: number | null;
};

export type ReportParams<F> = {
  filters: F;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

function shippingReportQs(
  filters: ShippingReportFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams({
    date_from: filters.date_from,
    date_to: filters.date_to,
  });
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.item_id) qs.set("item_id", String(filters.item_id));
  if (filters.status) qs.set("status", filters.status);
  if (filters.sales_order_id) qs.set("sales_order_id", String(filters.sales_order_id));
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export type ShipmentStatusRow = {
  shipping_order_id: number;
  line_id: number;
  shipping_date: string;
  shipping_no: string;
  status: string;
  customer_name: string;
  location_name: string;
  sales_order_no: string;
  item_code: string;
  item_name: string;
  qty: number;
  carrier?: string;
};

export type PendingShipmentRow = {
  sales_order_id: number;
  line_id: number;
  sales_order_no: string;
  customer_name: string;
  location_name: string;
  item_code: string;
  item_name: string;
  order_qty: number;
  shipped_qty: number;
  pending_qty: number;
  delivery_date?: string | null;
};

export type ShippingOrderStatusRow = {
  shipping_order_id: number;
  line_id: number;
  shipping_date: string;
  shipping_no: string;
  status: string;
  customer_name: string;
  location_name: string;
  sales_order_no: string;
  item_code: string;
  item_name: string;
  qty: number;
  freight_amount: number;
};

export function shipmentStatusExportUrl(filters: ShippingReportFilters): string {
  return `/api/v1/shipping/reports/shipment-status/export?${shippingReportQs(filters)}`;
}

export function pendingShipmentExportUrl(filters: ShippingReportFilters): string {
  return `/api/v1/shipping/reports/pending-shipment/export?${shippingReportQs(filters)}`;
}

export function shippingOrderStatusExportUrl(filters: ShippingReportFilters): string {
  return `/api/v1/shipping/reports/shipping-order-status/export?${shippingReportQs(filters)}`;
}

export function useShipmentStatusReport(params: () => ReportParams<ShippingReportFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = shippingReportQs(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["shipment-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ShipmentStatusRow[]>(`/api/v1/shipping/reports/shipment-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load shipment status");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function usePendingShipmentReport(params: () => ReportParams<ShippingReportFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = shippingReportQs(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["pending-shipment-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<PendingShipmentRow[]>(`/api/v1/shipping/reports/pending-shipment?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load pending shipment");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useShippingOrderStatusReport(params: () => ReportParams<ShippingReportFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = shippingReportQs(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["shipping-order-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ShippingOrderStatusRow[]>(`/api/v1/shipping/reports/shipping-order-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load shipping order status");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}
