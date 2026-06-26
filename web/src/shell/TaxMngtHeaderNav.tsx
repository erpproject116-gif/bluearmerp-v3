import { A, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { isTaxMngtNavLinkActive, isTaxMngtPath, taxMngtNavLinks } from "./tax-mngt-nav";

export function TaxMngtHeaderNav() {
  const loc = useLocation();
  return (
    <Show when={isTaxMngtPath(loc.pathname)}>
      <nav class="erp-header-features mt-3" aria-label="Tax Management features">
        {taxMngtNavLinks.map((link) => (
          <A
            href={link.href}
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            classList={{
              "bg-brand-50 text-brand-600": isTaxMngtNavLinkActive(loc.pathname, link),
              "text-text-secondary hover:erp-panel hover:text-text-primary": !isTaxMngtNavLinkActive(
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
