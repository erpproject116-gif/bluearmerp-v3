import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { hasModuleAccess, hasPermission, useAuth } from "../shared/auth-context";
import {
  isSerialLotNavLinkActive,
  isSerialLotPath,
  serialLotNavLinks,
} from "./serial-lot-nav";

export function SerialLotHeaderNav() {
  const loc = useLocation();
  const auth = useAuth();

  const visibleLinks = () =>
    serialLotNavLinks.filter((link) => {
      if (link.permissionCode?.startsWith("manufacturing.") && !hasModuleAccess(auth.me, "manufacturing")) {
        return false;
      }
      if (!link.permissionCode) return true;
      if (!auth.me?.user?.permissions || Object.keys(auth.me.user.permissions).length === 0) return true;
      return hasPermission(auth.me, link.permissionCode, "read");
    });

  return (
    <Show when={isSerialLotPath(loc.pathname)}>
      <nav class="erp-header-features mt-3" aria-label="Serial & Lot features">
        {visibleLinks().map((link) => (
          <A
            href={link.href}
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "bg-brand-50 text-brand-600": isSerialLotNavLinkActive(loc.pathname, link),
              "text-text-secondary hover:erp-panel hover:text-text-primary": !isSerialLotNavLinkActive(
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
