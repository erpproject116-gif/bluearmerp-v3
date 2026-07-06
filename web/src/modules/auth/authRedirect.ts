/** Base URL for Supabase email/OAuth redirects (must be allowlisted in Supabase). */
export function authRedirectUrl(path: string): string {
  const base = window.location.origin.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
