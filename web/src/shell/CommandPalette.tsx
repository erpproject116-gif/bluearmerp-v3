import { A, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { hasPermission, useAuth } from "../shared/auth-context";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { trackUxEvent } from "../shared/UsageTracker";
import { buildCatalog, searchCatalog, type NavCatalogEntry } from "./navCatalog";

const RECENT_KEY = "bluearm-recent-routes";
const MAX_RECENT = 8;

type QuickAction = NavCatalogEntry & { permission?: string };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New quotation", href: "/app/quotation/quotations/new", group: "Quick action", permission: "quotation.quotations_new" },
  { label: "New sales order", href: "/app/sales-order/sales-orders/new", group: "Quick action", permission: "sales_order.sales_orders_new" },
  { label: "New sales invoice", href: "/app/sales/sales/new", group: "Quick action", permission: "sales.sales_new" },
  { label: "New purchase request", href: "/app/purchase-request/purchase-requests/new", group: "Quick action", permission: "purchase_request.purchase_requests_new" },
  { label: "New purchase order", href: "/app/purchase-order/purchase-orders", group: "Quick action", permission: "purchase_order.purchase_orders" },
  { label: "New purchase receive", href: "/app/purchases/purchase-receive/new", group: "Quick action", permission: "purchases.purchases_new" },
  { label: "New receivable payment", href: "/app/finance/receivables", group: "Quick action", permission: "finance.official_receipts_new" },
  { label: "New payable payment", href: "/app/finance/payables", group: "Quick action", permission: "finance.payment_vouchers_new" },
];

function readRecent(): NavCatalogEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NavCatalogEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: NavCatalogEntry) {
  try {
    const next = [entry, ...readRecent().filter((r) => r.href !== entry.href)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function canAccessHref(me: ReturnType<typeof useAuth>["me"], href: string, explicit?: string): boolean {
  const code = explicit ?? permissionCodeForHref(href);
  if (!code || !me?.user?.permissions || Object.keys(me.user.permissions).length === 0) return true;
  return hasPermission(me, code, "read");
}

export function CommandPalette(props: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const catalog = buildCatalog();
  const [q, setQ] = createSignal("");
  const [active, setActive] = createSignal(0);

  const quickActions = createMemo(() =>
    QUICK_ACTIONS.filter((a) => canAccessHref(auth.me, a.href, a.permission)),
  );

  createEffect((wasOpen?: boolean) => {
    const open = props.open;
    if (open && !wasOpen) trackUxEvent("command_palette_open");
    return open;
  });

  const results = createMemo(() => {
    const needle = q().trim();
    if (!needle) {
      const recent = readRecent();
      return recent.length > 0 ? recent : catalog.slice(0, 10);
    }
    const navHits = searchCatalog(catalog, needle, 10);
    const actionHits = searchCatalog(quickActions(), needle, 6);
    const seen = new Set<string>();
    return [...actionHits, ...navHits].filter((e) => {
      if (seen.has(e.href)) return false;
      seen.add(e.href);
      return canAccessHref(auth.me, e.href);
    });
  });

  const pick = (entry: NavCatalogEntry) => {
    pushRecent(entry);
    props.onClose();
    setQ("");
    navigate(entry.href);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, results().length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const hit = results()[active()];
        if (hit) pick(hit);
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
        onClick={() => props.onClose()}
      >
        <div
          class="w-full max-w-xl overflow-hidden rounded-xl border border-stroke bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="border-b border-stroke px-4 py-3">
            <input
              type="search"
              class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-text-secondary"
              placeholder="Search screens and quick actions…"
              value={q()}
              autofocus
              onInput={(e) => {
                setQ(e.currentTarget.value);
                setActive(0);
              }}
            />
            <p class="mt-1 text-xs text-text-secondary">↑↓ navigate · Enter open · Esc close</p>
          </div>
          <ul class="max-h-80 overflow-y-auto py-1">
            <Show when={results().length === 0}>
              <li class="px-4 py-6 text-center text-sm text-text-secondary">No matches.</li>
            </Show>
            <For each={results()}>
              {(entry, i) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm"
                    classList={{
                      "bg-brand-50 text-brand-700": active() === i(),
                      "text-text-primary hover:bg-slate-50": active() !== i(),
                    }}
                    onMouseEnter={() => setActive(i())}
                    onClick={() => pick(entry)}
                  >
                    <span class="min-w-0 truncate">{entry.label}</span>
                    <span class="shrink-0 text-xs text-text-secondary">{entry.group}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <div class="border-t border-stroke px-4 py-2 text-xs text-text-secondary">
            <A href="/app/dashboard/site-map" class="text-brand-600 hover:underline" onClick={() => props.onClose()}>
              Full site map
            </A>
          </div>
        </div>
      </div>
    </Show>
  );
}

export function useCommandPaletteHotkey(onOpen: () => void) {
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });
}
