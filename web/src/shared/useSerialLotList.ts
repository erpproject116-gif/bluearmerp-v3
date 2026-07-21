import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SerialUnitRow = {
  id: number;
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  status: string;
  location_id?: number | null;
  location_name?: string;
  partner_id?: number | null;
  partner_name?: string;
  warranty_start?: string | null;
  warranty_end?: string | null;
  received_at?: string | null;
  purchase_order_no?: string | null;
  sales_id?: number | null;
  created_at: string;
};

export type SerialEventRow = {
  id: number;
  serial_unit_id: number;
  serial_no: string;
  item_code: string;
  item_name: string;
  event_type: string;
  from_location_name?: string | null;
  to_location_name?: string | null;
  ref_type?: string | null;
  ref_id?: number | null;
  notes?: string | null;
  created_by_name?: string;
  created_at: string;
};

export type LotBatchRow = {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  lot_no: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  expiry_date?: string | null;
  updated_at: string;
};

export type SerialTraceEvent = {
  id: number;
  event_type: string;
  from_location_name?: string;
  to_location_name?: string;
  ref_type?: string | null;
  ref_id?: number | null;
  notes?: string | null;
  created_by_name?: string;
  created_at: string;
};

export type SerialTraceResult = {
  unit: SerialUnitRow;
  events: SerialTraceEvent[];
  links: {
    purchase_request_no?: string | null;
  };
};

export type SerialUnitListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
  origin?: string;
  item_id?: number;
  location_id?: number;
  serial_no?: string;
  warranty_end_from?: string;
  warranty_end_to?: string;
  enabled?: boolean;
};

export type SerialEventListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  event_type?: string;
  date_from?: string;
  date_to?: string;
  enabled?: boolean;
};

export type LotBatchListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  item_id?: number;
  location_id?: number;
  enabled?: boolean;
};

function listParamsToSearchParams(
  p: { page: number; pageSize: number; sort: string; order: "asc" | "desc" },
  filters: Record<string, string | number | undefined>,
): string {
  const qs = new URLSearchParams({
    page: String(p.page),
    pageSize: String(p.pageSize),
    sort: p.sort,
    order: p.order,
  });
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== "" && val !== null) qs.set(key, String(val));
  }
  return qs.toString();
}

export function useSerialUnitList(params: () => SerialUnitListParams) {
  return createQuery(() => {
    const p = params();
    const qs = listParamsToSearchParams(p, {
      q: p.q,
      status: p.status,
      origin: p.origin,
      item_id: p.item_id,
      location_id: p.location_id,
      serial_no: p.serial_no,
      warranty_end_from: p.warranty_end_from,
      warranty_end_to: p.warranty_end_to,
    });

    return {
      queryKey: ["serial-units", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialUnitRow[]>(`/api/v1/inventory/serial-units?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load serial units");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 0,
      placeholderData: (prev: { rows: SerialUnitRow[]; total: number } | undefined) => prev,
    };
  });
}

export function useSerialEventList(params: () => SerialEventListParams) {
  return createQuery(() => {
    const p = params();
    const qs = listParamsToSearchParams(p, {
      q: p.q,
      event_type: p.event_type,
      date_from: p.date_from,
      date_to: p.date_to,
    });

    return {
      queryKey: ["serial-events", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialEventRow[]>(`/api/v1/inventory/serial-events?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load serial events");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 0,
      placeholderData: (prev: { rows: SerialEventRow[]; total: number } | undefined) => prev,
    };
  });
}

export function useLotBatchList(params: () => LotBatchListParams) {
  return createQuery(() => {
    const p = params();
    const qs = listParamsToSearchParams(p, {
      q: p.q,
      item_id: p.item_id,
      location_id: p.location_id,
    });

    return {
      queryKey: ["lot-batches", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<LotBatchRow[]>(`/api/v1/inventory/lot-batches?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load lot batches");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 0,
      placeholderData: (prev: { rows: LotBatchRow[]; total: number } | undefined) => prev,
    };
  });
}

export function useSerialTrace(serialNo: () => string | null) {
  return createQuery(() => {
    const sn = serialNo()?.trim() ?? "";
    return {
      queryKey: ["serial-trace", sn],
      enabled: Boolean(sn),
      queryFn: async (): Promise<SerialTraceResult> => {
        const qs = new URLSearchParams({ serial_no: sn });
        const res = await apiFetch<SerialTraceResult>(`/api/v1/inventory/serial-units/trace?${qs}`);
        if (!res.success || !res.data) throw new Error(res.message ?? "Serial not found");
        return res.data;
      },
      retry: false,
    };
  });
}

export function useInvalidateSerialLotLists() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["serial-units"] });
    void client.invalidateQueries({ queryKey: ["serial-events"] });
    void client.invalidateQueries({ queryKey: ["lot-batches"] });
    void client.invalidateQueries({ queryKey: ["serial-trace"] });
  };
}
