import { createClient } from "@supabase/supabase-js";

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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base = apiBase || "";
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new Error("ERR_NETWORK");
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  return { ...body, status: res.status, ok: res.ok };
}
