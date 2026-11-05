import { Navigate } from "@solidjs/router";

/** Legacy URL → canonical client portal. */
export default function PortalDashboardPage() {
  return <Navigate href="/app/hr/client-portal" />;
}
