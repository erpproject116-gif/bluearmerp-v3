import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { hasModuleAccess, hasPermission, useAuth } from "../../shared/auth-context";
import { isTenantModuleEnabled } from "../../shared/moduleAccess";

type Shortcut = { href: string; label: string; blurb: string };

export function HomeShortcuts() {
  const auth = useAuth();
  const items = createMemo((): Shortcut[] => {
    const m = auth.me;
    if (!m) return [];
    const out: Shortcut[] = [];
    if (isTenantModuleEnabled(m, "sales") && (hasModuleAccess(m, "sales") || hasPermission(m, "sales.sales", "write"))) {
      out.push({ href: "/app/sales/sales/new", label: "New sale", blurb: "Invoice a customer" });
    }
    if (isTenantModuleEnabled(m, "finance") && (hasModuleAccess(m, "finance") || hasPermission(m, "finance", "read"))) {
      out.push({ href: "/app/finance/receivables", label: "Collect", blurb: "Record a customer payment" });
      out.push({ href: "/app/finance/payables", label: "Pay", blurb: "Pay a vendor bill" });
    }
    if (isTenantModuleEnabled(m, "inventory") && (hasModuleAccess(m, "inventory") || hasPermission(m, "inventory", "write"))) {
      out.push({ href: "/app/inventory/items", label: "Add product", blurb: "Open the item list" });
      out.push({ href: "/app/inventory/partners", label: "Customers & vendors", blurb: "People you sell to or buy from" });
    }
    if (isTenantModuleEnabled(m, "purchases") && (hasModuleAccess(m, "purchases") || hasPermission(m, "purchases", "write"))) {
      out.push({ href: "/app/purchases/purchase-receive/new", label: "Purchase Receive", blurb: "Bring stock in" });
    }
    return out.slice(0, 6);
  });

  return (
    <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
      <h3 class="text-sm font-semibold text-text-primary">Quick actions</h3>
      <p class="mt-1 text-xs text-text-secondary">Start the job — forms stay the same as in the sidebar.</p>
      <Show when={items().length > 0} fallback={<p class="mt-3 text-sm text-text-secondary">No shortcuts for your role.</p>}>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <For each={items()}>
            {(s) => (
              <A
                href={s.href}
                class="rounded-lg border border-stroke px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p class="text-sm font-medium text-text-primary">{s.label}</p>
                <p class="text-xs text-text-secondary">{s.blurb}</p>
              </A>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
