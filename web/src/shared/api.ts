import { createClient } from "@supabase/supabase-js";
import { invalidateAfterMutation } from "./queryInvalidation";
import { getGlobalToast } from "./toast";
import { getActiveTenantId, getActiveBranchIdCurrent } from "./activeContext";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url || "http://localhost", anon || "anon", {
  auth: {
    flowType: "pkce",
    // Callback page exchanges the code once — avoid double exchange on client init.
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Dev: Vite proxies /api → localhost:8080. Ignore VITE_API_BASE_URL in dev to avoid wrong ports.
export const apiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");

/** Prefix API-relative paths (e.g. /api/v1/...) for img src and fetch in production. */
export function apiAbsoluteUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiBase || "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiConfigured = import.meta.env.DEV || Boolean(apiBase);

export function apiNetworkErrorMessage(): string {
  if (import.meta.env.DEV) {
    return "Could not connect to the API. Start the Go server: cd api && go run ./cmd/server";
  }
  if (!apiBase) {
    return "API URL is not configured. Set VITE_API_BASE_URL on Vercel to your Render URL, then redeploy.";
  }
  return `Could not reach the API at ${apiBase}. On Render, set CORS_ORIGIN to https://bluearmerp-v3.vercel.app (no trailing slash) and redeploy the API.`;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: { page: number; per_page: number; total: number };
  errors?: Record<string, string>;
  code?: string;
};

export type ApiResult<T> = ApiEnvelope<T> & {
  status: number;
  ok: boolean;
};

export type ApiFetchOptions = {
  /** Suppress automatic success toast (e.g. autosave, search, or custom messaging). */
  silent?: boolean;
  /** Background poll — does not count as user activity for idle timeout. */
  background?: boolean;
  /** Override the default success toast message. */
  successMessage?: string;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function shouldAutoSuccessToast(path: string, method?: string, options?: ApiFetchOptions): boolean {
  if (options?.silent) return false;
  const m = (method ?? "GET").toUpperCase();
  if (!MUTATING_METHODS.has(m)) return false;
  if (/\/search(\?|$)/.test(path)) return false;
  if (path.includes("/drafts") || path.includes("/draft")) return false;
  if (path.includes("/presence/")) return false;
  if (path.includes("/import-template")) return false;
  if (path.includes("/preview")) return false;
  if (/\/export(\?|$)/.test(path)) return false;
  if (/\/print(\?|$)/.test(path)) return false;
  return true;
}

function defaultSuccessMessage(method?: string, serverMessage?: string, override?: string): string {
  if (override?.trim()) return override.trim();
  const msg = serverMessage?.trim();
  if (msg) return msg;
  const m = (method ?? "GET").toUpperCase();
  switch (m) {
    case "POST":
      return "Created successfully.";
    case "PUT":
    case "PATCH":
      return "Updated successfully.";
    case "DELETE":
      return "Deleted successfully.";
    default:
      return "Saved successfully.";
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: ApiFetchOptions,
): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Tell the API which business this request targets (multi-tenant logins).
  const activeTenantId = getActiveTenantId();
  if (activeTenantId && !headers.has("X-Tenant-ID")) {
    headers.set("X-Tenant-ID", String(activeTenantId));
  }
  const activeBranchId = getActiveBranchIdCurrent();
  if (activeBranchId && !headers.has("X-Branch-ID")) {
    headers.set("X-Branch-ID", String(activeBranchId));
  }
  if (!options?.silent && !options?.background) {
    headers.set("X-User-Activity", "1");
  }
  const base = apiBase || "";
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new Error("ERR_NETWORK");
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  const result = { ...body, status: res.status, ok: res.ok };
  if (body.code === "ERR_SESSION_IDLE" && !options?.background) {
    const { handleServerSessionIdle } = await import("./sessionIdleClient");
    void handleServerSessionIdle();
    return result;
  }
  if (body.success && shouldAutoSuccessToast(path, init.method, options)) {
    getGlobalToast()?.success(
      defaultSuccessMessage(init.method, body.message, options?.successMessage),
    );
  }
  if (body.success) {
    invalidateAfterMutation(path, init.method);
  }
  return result;
}
