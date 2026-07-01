import { apiBase } from "./api";

export type PortalSession = {
  id: number;
  email: string;
  display_name: string;
  partner_id: number;
  partner_name?: string;
};

export type PortalListMeta = {
  page: number;
  per_page: number;
  total: number;
};

export type PortalApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PortalListMeta;
};

const PORTAL_TOKEN_KEY = "portal_token";

export function getPortalToken(): string | null {
  const fromStorage = sessionStorage.getItem(PORTAL_TOKEN_KEY);
  if (fromStorage) return fromStorage;
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) {
    sessionStorage.setItem(PORTAL_TOKEN_KEY, fromUrl);
    return fromUrl;
  }
  return null;
}

export function setPortalToken(token: string) {
  sessionStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export function clearPortalToken() {
  sessionStorage.removeItem(PORTAL_TOKEN_KEY);
}

export async function portalFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<PortalApiEnvelope<T> & { status: number; ok: boolean }> {
  const token = init?.token ?? getPortalToken();
  const url = new URL(`${apiBase}${path}`, window.location.origin);
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "X-Portal-Token": token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as PortalApiEnvelope<T>;
  return { ...body, status: res.status, ok: res.ok };
}

export async function requestPortalMagicLink(email: string) {
  return portalFetch<{ token?: string; login_url?: string; message?: string }>(
    "/api/v1/portal/auth/request-link",
    { method: "POST", body: JSON.stringify({ email }), token: "" },
  );
}

export async function fetchPortalSession(token?: string) {
  return portalFetch<PortalSession>("/api/v1/portal/auth/session", { token });
}
