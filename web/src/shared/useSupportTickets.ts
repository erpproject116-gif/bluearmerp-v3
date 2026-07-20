import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export type TicketComment = {
  id: number;
  user_id?: number | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type Ticket = {
  id: number;
  ticket_no: string;
  ticket_date: string;
  subject: string;
  description?: string | null;
  partner_id?: number | null;
  partner_name?: string;
  warranty_asset_id?: number | null;
  repair_order_id?: number | null;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_user_id?: number | null;
  assigned_name?: string;
  created_by_user_id?: number | null;
  created_by_name?: string;
  resolved_at?: string | null;
  comments?: TicketComment[];
};

export type TicketListParams = {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
};

type TicketListCache = { rows: Ticket[]; total: number };

function listRowFromTicket(t: Ticket): Ticket {
  const { comments: _comments, ...row } = t;
  return row;
}

export function useSupportTickets(params: () => TicketListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
    });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    if (p.sort) qs.set("sort", p.sort);
    if (p.order) qs.set("order", p.order);
    return {
      queryKey: ["support-tickets", p],
      queryFn: async () => {
        const res = await apiFetch<Ticket[]>(`/api/v1/support/tickets?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load tickets");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
      refetchOnMount: "always" as const,
    };
  });
}

export function useSupportTicket(id: () => number | null) {
  return createQuery(() => {
    const ticketId = id();
    return {
      queryKey: ["support-ticket", ticketId],
      enabled: ticketId != null && ticketId > 0,
      queryFn: async () => {
        const res = await apiFetch<Ticket>(`/api/v1/support/tickets/${ticketId}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load ticket");
        return res.data!;
      },
      staleTime: 10_000,
      refetchOnMount: "always" as const,
    };
  });
}

export async function createTicket(body: {
  subject: string;
  description?: string;
  partner_id?: number | null;
  warranty_asset_id?: number | null;
  repair_order_id?: number | null;
  category?: string;
  priority?: TicketPriority;
  assigned_user_id?: number | null;
}) {
  return apiFetch<Ticket>("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(body) });
}

export async function patchTicket(
  id: number,
  body: Partial<{
    subject: string;
    description: string | null;
    category: string;
    priority: TicketPriority;
    status: TicketStatus;
    assigned_user_id: number | null;
    warranty_asset_id: number | null;
    repair_order_id: number | null;
  }>,
) {
  return apiFetch<Ticket>(`/api/v1/support/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function addTicketComment(id: number, body: string) {
  return apiFetch<Ticket>(`/api/v1/support/tickets/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** Optimistically patch list/detail caches, then invalidate so remounted list is fresh. */
export function useInvalidateSupportTickets() {
  const client = useQueryClient();
  return async (updated?: Ticket) => {
    if (updated) {
      client.setQueryData(["support-ticket", updated.id], updated);
      client.setQueriesData<TicketListCache>(
        { queryKey: ["support-tickets"] },
        (old) => {
          if (!old?.rows) return old;
          const nextRow = listRowFromTicket(updated);
          return {
            ...old,
            rows: old.rows.map((r) => (r.id === updated.id ? { ...r, ...nextRow } : r)),
          };
        },
      );
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: ["support-tickets"] }),
      client.invalidateQueries({ queryKey: ["support-ticket"] }),
    ]);
  };
}
