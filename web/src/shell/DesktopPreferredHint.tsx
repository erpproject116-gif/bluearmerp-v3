import { Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useShell } from "./shell-context";

const PREFIXES = [
  "/app/quotation",
  "/app/sales-order",
  "/app/sales",
  "/app/selling",
  "/app/purchase-request",
  "/app/purchase-order",
  "/app/purchases",
  "/app/buying",
] as const;

export function isSellBuyDesktopPreferredPath(pathname: string): boolean {
  return PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** One-line hint on sell/buy list screens when chrome is phone-narrow. */
export function DesktopPreferredHint() {
  const loc = useLocation();
  const shell = useShell();
  const show = () =>
    shell.viewport.isNarrow() && isSellBuyDesktopPreferredPath(loc.pathname);

  return (
    <Show when={show()}>
      <p class="mb-3 rounded-lg border border-stroke bg-panel px-3 py-2 text-xs text-text-secondary">
        This screen is easier on a laptop.
      </p>
    </Show>
  );
}
