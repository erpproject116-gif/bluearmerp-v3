import { For, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { afterSalesNavLinks, isAfterSalesNavLinkActive, isAfterSalesPath } from "./after-sales-nav";

export function AfterSalesHeaderNav() {
  const loc = useLocation();
  const show = () => isAfterSalesPath(loc.pathname);

  return (
    <Show when={show()}>
      <nav class="mt-3 flex flex-wrap gap-1" aria-label="After-Sales features">
        <For each={afterSalesNavLinks}>
          {(link) => (
            <A
              href={link.href}
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              classList={{
                "bg-brand-50 text-brand-600": isAfterSalesNavLinkActive(loc.pathname, link),
                "text-text-secondary hover:bg-slate-50 hover:text-text-primary": !isAfterSalesNavLinkActive(
                  loc.pathname,
                  link,
                ),
              }}
            >
              {link.label}
            </A>
          )}
        </For>
      </nav>
    </Show>
  );
}
