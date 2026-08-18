import type { IncomingMessage, ServerResponse } from "node:http";
import {
  articleHttpDecision,
  type CmsPublicPage,
  legacyArticlesPath,
  renderArticleHtmlMeta,
  renderArticleMarkdown,
  renderArticlesIndexMd,
  renderHubHtml,
  renderLlmsTxt,
  renderNotFoundHtml,
  renderRobotsTxt,
  renderSitemapXml,
} from "./_lib/publicHtml.js";

type Envelope<T> = { success?: boolean; data?: T; meta?: { total?: number }; message?: string };

function previewTokenFrom(req: IncomingMessage, url: URL): string {
  const direct = url.searchParams.get("preview") || "";
  if (direct) return direct;
  const invoke = String(req.headers["x-invoke-query"] || "");
  if (invoke) {
    try {
      const qs = new URLSearchParams(decodeURIComponent(invoke));
      const t = qs.get("preview") || "";
      if (t) return t;
    } catch {
      /* ignore */
    }
  }
  const fwd = String(req.headers["x-forwarded-uri"] || "");
  const q = fwd.includes("?") ? fwd.slice(fwd.indexOf("?") + 1) : "";
  return q ? new URLSearchParams(q).get("preview") || "" : "";
}

function envOf(): { siteUrl: string; apiBase: string; siteName: string } {
  const apiBase = (process.env.CMS_API_BASE_URL || process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const siteUrl = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return {
    apiBase,
    siteUrl: siteUrl || "https://bluearmerp.com",
    siteName: process.env.CMS_SITE_NAME || "Bluearm",
  };
}

async function fetchJson<T>(url: string): Promise<Envelope<T>> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CMS API ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error(`CMS API returned non-JSON from ${url}`);
  }
}

function send(res: ServerResponse, status: number, contentType: string, body: string, extra?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  }
  res.end(body);
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 301;
  res.setHeader("Location", location);
  res.end();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const env = envOf();
  const host = req.headers.host || "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const kind = url.searchParams.get("kind") || "";
  const topic = (url.searchParams.get("topic") || "").toLowerCase();
  const slug = (url.searchParams.get("slug") || "").toLowerCase();
  const preview = previewTokenFrom(req, url);

  if (!env.apiBase) {
    send(res, 503, "text/plain; charset=utf-8", "CMS_API_BASE_URL is not set.");
    return;
  }

  if (kind === "legacy") {
    redirect(res, legacyArticlesPath(topic, slug));
    return;
  }

  if (kind === "robots") {
    send(res, 200, "text/plain; charset=utf-8", renderRobotsTxt(env.siteUrl));
    return;
  }

  try {
    if (kind === "sitemap" || kind === "llms" || kind === "llms-full" || kind === "index-md" || kind === "hub" || kind === "topic") {
      const qs = new URLSearchParams({ page: "1", pageSize: "100", sort: "published_at", order: "desc" });
      if (kind === "topic" && topic) qs.set("topic", topic);
      const list = await fetchJson<CmsPublicPage[]>(`${env.apiBase}/api/v1/public/cms/pages?${qs}`);
      const rows = list.data ?? [];
      if (kind === "sitemap") {
        send(res, 200, "application/xml; charset=utf-8", renderSitemapXml(env.siteUrl, rows));
        return;
      }
      if (kind === "llms" || kind === "llms-full") {
        send(res, 200, "text/plain; charset=utf-8", renderLlmsTxt(env.siteUrl, rows, kind === "llms-full"));
        return;
      }
      if (kind === "index-md") {
        send(res, 200, "text/markdown; charset=utf-8", renderArticlesIndexMd(env.siteUrl, rows));
        return;
      }
      const { html, csp } = renderHubHtml(rows, env, kind === "topic" ? topic : undefined);
      send(res, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": csp });
      return;
    }

    if ((kind === "article" || kind === "md") && slug) {
      const path = preview
        ? `${env.apiBase}/api/v1/public/cms/preview?token=${encodeURIComponent(preview)}`
        : `${env.apiBase}/api/v1/public/cms/pages/by-slug/${encodeURIComponent(slug)}`;
      const got = await fetchJson<{ redirect_to?: string; page?: CmsPublicPage }>(path);
      const decision = articleHttpDecision({
        page: got.data?.page,
        redirectTo: got.data?.redirect_to,
        requestTopic: topic,
      });
      if (decision.status === 301 && decision.location) {
        redirect(res, decision.location);
        return;
      }
      const page = got.data?.page;
      if (decision.status === 404 || !page) {
        const nf = renderNotFoundHtml();
        send(res, 404, "text/html; charset=utf-8", nf.html, { "Content-Security-Policy": nf.csp });
        return;
      }
      if (kind === "md") {
        send(res, 200, "text/markdown; charset=utf-8", renderArticleMarkdown(page, env));
        return;
      }
      const { html, csp } = renderArticleHtmlMeta(page, { ...env, noindex: Boolean(preview) });
      send(res, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": csp });
      return;
    }

    const nf = renderNotFoundHtml();
    send(res, 404, "text/html; charset=utf-8", nf.html, { "Content-Security-Policy": nf.csp });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to render.";
    console.error("cms-public:", msg);
    send(res, 502, "text/plain; charset=utf-8", msg);
  }
}
