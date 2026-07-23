import { A, useLocation } from "@solidjs/router";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { hasModuleAccess, hasPermission, useAuth } from "../shared/auth-context";
import {
  isSerialLotNavLinkActive,
  isSerialLotPath,
  serialLotNavLinks,
  type SerialLotNavLink,
} from "./serial-lot-nav";

export function SerialLotHeaderNav() {
  const loc = useLocation();
  const auth = useAuth();
  const [moreOpen, setMoreOpen] = createSignal(false);

  const visibleLinks = () =>
    serialLotNavLinks.filter((link) => {
      if (link.permissionCode?.startsWith("manufacturing.") && !hasModuleAccess(auth.me, "manufacturing")) {
        return false;
      }
      if (!link.permissionCode) return true;
      if (!auth.me?.user?.permissions || Object.keys(auth.me.user.permissions).length === 0) return true;
      return hasPermission(auth.me, link.permissionCode, "read");
    });

  const primary = () => visibleLinks().filter((l) => l.headerPriority === "primary");
  const overflow = () => visibleLinks().filter((l) => l.headerPriority !== "primary");
  const overflowActive = () => overflow().some((l) => isSerialLotNavLinkActive(loc.pathname, l));

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-header-more-menu]")) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    });
  });

  const linkClass = (link: SerialLotNavLink) => {
    const active = isSerialLotNavLinkActive(loc.pathname, link);
    return {
      "bg-brand-50 text-brand-600": active,
      "text-text-secondary hover:erp-panel hover:text-text-primary": !active,
    };
  };

  return (
    <Show when={isSerialLotPath(loc.pathname)}>
      <nav class="erp-header-features mt-3 items-center" aria-label="Serial & Lot features">
        <For each={primary()}>
          {(link) => (
            <A href={link.href} class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors" classList={linkClass(link)}>
              {link.label}
            </A>
          )}
        </For>
        <Show when={overflow().length > 0}>
          <div class="relative" data-header-more-menu>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              classList={{
                "bg-brand-50 text-brand-600": overflowActive() || moreOpen(),
                "text-text-secondary hover:erp-panel hover:text-text-primary": !overflowActive() && !moreOpen(),
              }}
              aria-expanded={moreOpen()}
              aria-haspopup="menu"
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
              <div
                role="menu"
                class="absolute left-0 z-[60] mt-1 max-h-80 min-w-[14rem] overflow-y-auto rounded-lg border border-stroke bg-surface py-1 shadow-lg"
              >
                <For each={overflow()}>
                  {(link) => (
                    <A
                      href={link.href}
                      role="menuitem"
                      class="block whitespace-normal px-3 py-2 text-sm transition-colors"
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
