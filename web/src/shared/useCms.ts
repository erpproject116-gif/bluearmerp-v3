import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type CmsPage = {
  id: number;
  title: string;
  topic?: string;
  slug: string;
  permalink?: string;
  status: string;
  body?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  featured_media_id?: number | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  custom_values?: Record<string, unknown>;
};

export type CmsSlugResolve = {
  redirect_to?: string;
  page?: CmsPage;
};

export type CmsMedia = {
  id: number;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
  alt_text?: string;
  uploaded_by_user_id?: number | null;
  created_at: string;
};

export type CmsRedirect = {
  id: number;
  from_slug: string;
  to_slug: string;
  created_at: string;
};

export type CmsPagePatch = {
  title?: string;
  topic?: string;
  slug?: string;
  body?: string;
  seo_title?: string | null;
  seo_description?: string | null;
  featured_media_id?: number | null;
  leave_redirect?: boolean;
  custom_values?: Record<string, unknown>;
};

export function useCmsPages(params: () => { page: number; pageSize: number; status?: string; topic?: string; q?: string; sort?: string; order?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.status) qs.set("status", p.status);
    if (p.topic) qs.set("topic", p.topic);
    if (p.q) qs.set("q", p.q);
    if (p.sort) qs.set("sort", p.sort);
    if (p.order) qs.set("order", p.order);
    return {
      queryKey: ["cms-pages", p.page, p.pageSize, p.status ?? "", p.topic ?? "", p.q ?? "", p.sort ?? "", p.order ?? ""],
      queryFn: async () => {
        const res = await apiFetch<CmsPage[]>(`/api/v1/cms/pages?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load pages");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useCmsPage(id: () => number | null) {
  return createQuery(() => {
    const pageId = id();
    return {
      queryKey: ["cms-page", pageId],
      enabled: pageId != null && pageId > 0,
      queryFn: async () => {
        const res = await apiFetch<CmsPage>(`/api/v1/cms/pages/${pageId}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load page");
        return res.data!;
      },
    };
  });
}

export function useCmsPageBySlug(slug: () => string) {
  return createQuery(() => {
    const s = slug();
    return {
      queryKey: ["cms-page-slug", s],
      enabled: s.length > 0,
      queryFn: async () => {
        const res = await apiFetch<CmsSlugResolve>(`/api/v1/cms/pages/by-slug/${encodeURIComponent(s)}`);
        if (!res.success) throw new Error(res.message ?? "Page not found");
        return res.data!;
      },
    };
  });
}

/** Anonymous catalog: platform/marketing tenant only (CMS_PUBLIC_TENANT_CODE). */
export function usePublicCmsPages(params: () => { page: number; pageSize: number; topic?: string; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: "published_at", order: "desc" });
    if (p.topic) qs.set("topic", p.topic);
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["public-cms-pages", p.page, p.pageSize, p.topic ?? "", p.q ?? ""],
      queryFn: async () => {
        const res = await apiFetch<CmsPage[]>(`/api/v1/public/cms/pages?${qs}`, undefined, { silent: true });
        if (!res.success) throw new Error(res.message ?? "Failed to load articles");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function usePublicCmsPageBySlug(slug: () => string) {
  return createQuery(() => {
    const s = slug();
    return {
      queryKey: ["public-cms-page-slug", s],
      enabled: s.length > 0,
      queryFn: async () => {
        const res = await apiFetch<CmsSlugResolve>(
          `/api/v1/public/cms/pages/by-slug/${encodeURIComponent(s)}`,
          undefined,
          { silent: true },
        );
        if (!res.success) throw new Error(res.message ?? "Page not found");
        return res.data!;
      },
    };
  });
}

export function useCmsMedia(params: () => { page: number; pageSize: number; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: "created_at", order: "desc" });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["cms-media", p.page, p.pageSize, p.q ?? ""],
      queryFn: async () => {
        const res = await apiFetch<CmsMedia[]>(`/api/v1/cms/media?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load media");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useCmsRedirects(params: () => { page: number; pageSize: number }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: "created_at", order: "desc" });
    return {
      queryKey: ["cms-redirects", p.page, p.pageSize],
      queryFn: async () => {
        const res = await apiFetch<CmsRedirect[]>(`/api/v1/cms/redirects?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load redirects");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });
}

export function useCmsMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cms-pages"] });
    void qc.invalidateQueries({ queryKey: ["cms-page"] });
    void qc.invalidateQueries({ queryKey: ["cms-page-slug"] });
    void qc.invalidateQueries({ queryKey: ["cms-media"] });
    void qc.invalidateQueries({ queryKey: ["cms-redirects"] });
  };
  return {
    createPage: createMutation(() => ({
      mutationFn: async (body: { title: string; slug?: string; topic?: string; custom_values?: Record<string, unknown> }) => {
        const res = await apiFetch<CmsPage>("/api/v1/cms/pages", { method: "POST", body: JSON.stringify(body) });
        if (!res.success) throw new Error(res.message ?? "Create failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    patchPage: createMutation(() => ({
      mutationFn: async (args: { id: number; body: CmsPagePatch }) => {
        const res = await apiFetch<CmsPage>(`/api/v1/cms/pages/${args.id}`, {
          method: "PATCH",
          body: JSON.stringify(args.body),
        });
        if (!res.success) throw new Error(res.message ?? "Update failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    publishPage: createMutation(() => ({
      mutationFn: async (id: number) => {
        const res = await apiFetch<CmsPage>(`/api/v1/cms/pages/${id}/publish`, { method: "POST" });
        if (!res.success) throw new Error(res.message ?? "Publish failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    archivePage: createMutation(() => ({
      mutationFn: async (id: number) => {
        const res = await apiFetch<CmsPage>(`/api/v1/cms/pages/${id}/archive`, { method: "POST" });
        if (!res.success) throw new Error(res.message ?? "Archive failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    deleteMedia: createMutation(() => ({
      mutationFn: async (id: number) => {
        const res = await apiFetch(`/api/v1/cms/media/${id}`, { method: "DELETE" });
        if (!res.success) throw new Error(res.message ?? "Delete failed");
      },
      onSuccess: invalidate,
    })),
    createRedirect: createMutation(() => ({
      mutationFn: async (body: { from_slug: string; to_slug: string }) => {
        const res = await apiFetch<CmsRedirect>("/api/v1/cms/redirects", { method: "POST", body: JSON.stringify(body) });
        if (!res.success) throw new Error(res.message ?? "Create failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    deleteRedirect: createMutation(() => ({
      mutationFn: async (id: number) => {
        const res = await apiFetch(`/api/v1/cms/redirects/${id}`, { method: "DELETE" });
        if (!res.success) throw new Error(res.message ?? "Delete failed");
      },
      onSuccess: invalidate,
    })),
    invalidate,
  };
}
