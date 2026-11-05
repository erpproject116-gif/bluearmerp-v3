import { Navigate, useSearchParams } from "@solidjs/router";
import { setPortalToken } from "../../shared/portal-api";

/** Legacy URL → canonical client portal (preserve magic-link token). */
export default function PortalDashboardPage() {
  const [params] = useSearchParams();
  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (token) setPortalToken(token);
  const href = token
    ? `/app/hr/client-portal?token=${encodeURIComponent(token)}`
    : "/app/hr/client-portal";
  return <Navigate href={href} />;
}
