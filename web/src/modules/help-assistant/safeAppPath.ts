/** Safe in-app deep-link paths for Baiko navigation (mirrors server SafeAppPath). */
export function safeAppPath(href: string): string | null {
  const h = (href || "").trim();
  if (!h) return null;
  const lower = h.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("vbscript:")) return null;
  if (/[\s\\\x00]/.test(h) || h.startsWith("//") || h.includes("://")) return null;
  if (!h.startsWith("/app/")) return null;
  if (h.split("/").includes("..")) return null;
  try {
    const u = new URL(h, "https://bluearm.local");
    if (u.host !== "bluearm.local" || u.protocol !== "https:") return null;
    const path = u.pathname + (u.search || "");
    if (!path.startsWith("/app/")) return null;
    return path;
  } catch {
    return null;
  }
}

export function isExternalHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test((href || "").trim());
}
