import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { hasPermission, useAuth } from "../shared/auth-context";
import { acctINavLinks, isAcctINavLinkActive, isAcctIPath } from "./acct-i-nav";

export function AcctIHeaderNav() {
  const loc = useLocation();
  const auth = useAuth();

  const visibleLinks = () =>
    acctINavLinks.filter((link) => {
      if (!link.permissionCode) return true;
      if (!auth.me?.user?.permissions || Object.keys(auth.me.user.permissions).length === 0) return true;
      return hasPermission(auth.me, link.permissionCode, "read");
    });

  return (
    <Show when={isAcctIPath(loc.pathname)}>
      <nav class="erp-header-features mt-3" aria-label="Acct. I features">
        {visibleLinks().map((link) => (
          <A
            href={link.href}
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "bg-brand-50 text-brand-600": isAcctINavLinkActive(loc.pathname, link),
              "text-text-secondary hover:erp-panel hover:text-text-primary": !isAcctINavLinkActive(
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
