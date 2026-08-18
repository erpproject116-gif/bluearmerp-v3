/** Published reading surface — not the Pages admin list. */

export const CMS_ARTICLES_PREFIX = "/articles";
export const DEFAULT_CMS_TOPIC = "blog";

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCmsSlug(raw: string): string {
  const s = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
  return s;
}

export function validCmsSlug(s: string): boolean {
  return s.length > 0 && s.length <= 120 && slugRe.test(s);
}

export function cmsTopicOrDefault(topic: string | null | undefined): string {
  const t = normalizeCmsSlug(topic || "");
  return validCmsSlug(t) ? t : DEFAULT_CMS_TOPIC;
}

export function cmsArticlePath(topic: string | null | undefined, slug: string | null | undefined): string {
  return `${CMS_ARTICLES_PREFIX}/${cmsTopicOrDefault(topic)}/${normalizeCmsSlug(slug || "") || "page"}`;
}

export function cmsTopicPath(topic: string | null | undefined): string {
  return `${CMS_ARTICLES_PREFIX}/${cmsTopicOrDefault(topic)}`;
}

export function isCmsArticlesPath(pathname: string): boolean {
  return pathname === CMS_ARTICLES_PREFIX || pathname.startsWith(`${CMS_ARTICLES_PREFIX}/`);
}

/** Same-origin published article paths only (hub, topic, or article). */
export function safeArticlesPath(href: string): string | null {
  const h = (href || "").trim();
  if (!h) return null;
  const lower = h.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("vbscript:")) return null;
  if (/[\s\\\x00]/.test(h) || h.startsWith("//") || h.includes("://")) return null;
  if (h !== CMS_ARTICLES_PREFIX && !h.startsWith(`${CMS_ARTICLES_PREFIX}/`)) return null;
  if (h.split("/").includes("..")) return null;
  try {
    const u = new URL(h, "https://bluearm.local");
    if (u.host !== "bluearm.local" || u.protocol !== "https:") return null;
    const path = u.pathname;
    if (!/^\/articles(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}
