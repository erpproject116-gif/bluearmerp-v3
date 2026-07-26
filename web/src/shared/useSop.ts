import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SopDocument = {
  id: number;
  title: string;
  category: string;
  status: string;
  owner_user_id?: number | null;
  owner_name?: string;
  body?: string;
  version: number;
  reviewed_at?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  stale?: boolean;
};

export type SopDashboard = {
  by_status: { key: string; count: number }[];
  by_category: { key: string; count: number }[];
  stale_count: number;
  stale_days: number;
};

export function useSopDocuments(params: () => { page: number; pageSize: number; status?: string; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.status) qs.set("status", p.status);
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["sop-documents", p.page, p.pageSize, p.status ?? "", p.q ?? ""],
      queryFn: async () => {
        const res = await apiFetch<SopDocument[]>(`/api/v1/sop/documents?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load SOPs");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function useSopDocument(id: () => number | null) {
  return createQuery(() => {
    const docId = id();
    return {
      queryKey: ["sop-document", docId],
      enabled: docId != null && docId > 0,
      queryFn: async () => {
        const res = await apiFetch<SopDocument>(`/api/v1/sop/documents/${docId}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load SOP");
        return res.data!;
      },
    };
  });
}

export function useSopDashboard() {
  return createQuery(() => ({
    queryKey: ["sop-dashboard"],
    queryFn: async () => {
      const res = await apiFetch<SopDashboard>("/api/v1/sop/dashboard/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load SOP dashboard");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export function useSopMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sop-documents"] });
    void qc.invalidateQueries({ queryKey: ["sop-document"] });
    void qc.invalidateQueries({ queryKey: ["sop-dashboard"] });
  };
  return {
    create: createMutation(() => ({
      mutationFn: async (body: { title: string; category?: string; body?: string }) => {
        const res = await apiFetch<SopDocument>("/api/v1/sop/documents", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.success) throw new Error(res.message ?? "Create failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    publish: createMutation(() => ({
      mutationFn: async (id: number) => {
        const res = await apiFetch<SopDocument>(`/api/v1/sop/documents/${id}/publish`, { method: "POST" });
        if (!res.success) throw new Error(res.message ?? "Publish failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    patch: createMutation(() => ({
      mutationFn: async (args: { id: number; body: Record<string, unknown> }) => {
        const res = await apiFetch<SopDocument>(`/api/v1/sop/documents/${args.id}`, {
          method: "PATCH",
          body: JSON.stringify(args.body),
        });
        if (!res.success) throw new Error(res.message ?? "Update failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
  };
}
