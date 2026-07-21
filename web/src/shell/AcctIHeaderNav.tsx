import { A, useLocation } from "@solidjs/router";
import { For, Show, createSignal, onCleanup } from "solid-js";
import { hasPermission, useAuth } from "../shared/auth-context";
import { isTenantFeatureEnabled } from "../shared/moduleAccess";
import {
  acctINavLinks,
  isAcctINavLinkActive,
  isAcctIPath,
  type AcctNavLink,
} from "./acct-i-nav";

export function AcctIHeaderNav() {
  const loc = useLocation();
  const auth = useAuth();
  const [moreOpen, setMoreOpen] = createSignal(false);
  let moreRoot: HTMLDivElement | undefined;

  const featureOn = () => isTenantFeatureEnabled(auth.me, "finance.acct_i", "finance");

  const visibleLinks = () =>
    acctINavLinks.filter((link) => {
      if (!link.permissionCode) return true;
      if (!auth.me?.user?.permissions || Object.keys(auth.me.user.permissions).length === 0) return true;
      return hasPermission(auth.me, link.permissionCode, "read");
    });

  const primary = () => visibleLinks().filter((l) => l.headerPriority === "primary");
  const overflow = () => visibleLinks().filter((l) => l.headerPriority !== "primary");
  const overflowActive = () => overflow().some((l) => isAcctINavLinkActive(loc.pathname, l));

  const onDocClick = (e: MouseEvent) => {
    if (!moreRoot?.contains(e.target as Node)) setMoreOpen(false);
  };
  if (typeof document !== "undefined") {
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  }

  const linkClass = (link: AcctNavLink) => {
    const active = isAcctINavLinkActive(loc.pathname, link);
    return {
      "bg-brand-50 text-brand-600": active,
      "text-text-secondary hover:erp-panel hover:text-text-primary": !active,
    };
  };

  return (
    <Show when={isAcctIPath(loc.pathname) && featureOn()}>
      <nav class="erp-header-features mt-3 flex flex-wrap items-center gap-1" aria-label="General ledger features">
        <For each={primary()}>
          {(link) => (
            <A href={link.href} class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors" classList={linkClass(link)}>
              {link.label}
            </A>
          )}
        </For>
        <Show when={overflow().length > 0}>
          <div class="relative" ref={moreRoot}>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              classList={{
                "bg-brand-50 text-brand-600": overflowActive() || moreOpen(),
                "text-text-secondary hover:erp-panel hover:text-text-primary": !overflowActive() && !moreOpen(),
              }}
              aria-expanded={moreOpen()}
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((v) => !v);
              }}
            >
              More
              <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <Show when={moreOpen()}>
              <div class="absolute left-0 z-50 mt-1 max-h-80 min-w-[14rem] overflow-y-auto rounded-lg border border-stroke bg-surface py-1 shadow-lg">
                <For each={overflow()}>
                  {(link) => (
                    <A
                      href={link.href}
                      class="block px-3 py-2 text-sm transition-colors"
                      classList={linkClass(link)}
                      onClick={() => setMoreOpen(false)}
                    >
                      {link.label}
                    </A>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </nav>
    </Show>
  );
}
