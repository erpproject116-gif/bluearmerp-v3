import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { hasPermission, useAuth } from "../shared/auth-context";
import {
  collectiveInvoicingNavLinks,
  isCollectiveInvoicingNavLinkActive,
  isCollectiveInvoicingPath,
} from "./collective-invoicing-nav";

export function CollectiveInvoicingHeaderNav() {
  const loc = useLocation();
  const auth = useAuth();

  const visibleLinks = () =>
    collectiveInvoicingNavLinks.filter((link) => {
      if (!link.permissionCode) return true;
      if (!auth.me?.user?.permissions || Object.keys(auth.me.user.permissions).length === 0) return true;
      return hasPermission(auth.me, link.permissionCode, "read");
    });

  return (
    <Show when={isCollectiveInvoicingPath(loc.pathname)}>
      <nav class="erp-header-features mt-3" aria-label="Collective Invoicing features">
        {visibleLinks().map((link) => (
          <A
            href={link.href}
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "bg-brand-50 text-brand-600": isCollectiveInvoicingNavLinkActive(loc.pathname, link),
              "text-text-secondary hover:erp-panel hover:text-text-primary": !isCollectiveInvoicingNavLinkActive(
                loc.pathname,
                link,
              ),
            }}
          >
            {link.label}
          </A>
        ))}
      </nav>
    </Show>
  );
}
