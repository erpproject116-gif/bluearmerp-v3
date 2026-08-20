import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useHelpAssistantUi } from "../modules/help-assistant/helpAssistantContext";
import { hasPermission, useAuth } from "../shared/auth-context";
import { permissionCodeForHref } from "../shared/permissionCodes";
import { trackUxEvent } from "../shared/UsageTracker";
import {
  buildPaletteResults,
  paletteItemDetail,
  paletteItemGroup,
  paletteItemLabel,
  type PaletteItem,
} from "./commandPaletteResults";
import { buildCatalog, type NavCatalogEntry } from "./navCatalog";

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
  const loc = useLocation();
  const navigate = useNavigate();
  const helpUi = useHelpAssistantUi();
  const catalog = buildCatalog();
  const [q, setQ] = createSignal("");
  const [active, setActive] = createSignal(0);
  let inputEl: HTMLInputElement | undefined;

  const quickActions = createMemo(() =>
    QUICK_ACTIONS.filter((a) => canAccessHref(auth.me, a.href, a.permission)),
  );

  createEffect((wasOpen?: boolean) => {
    const open = props.open;
    if (open && !wasOpen) {
      trackUxEvent("command_palette_open");
      setQ("");
      setActive(0);
      queueMicrotask(() => inputEl?.focus());
    }
    return open;
  });

  const results = createMemo(() =>
    buildPaletteResults({
      query: q(),
      catalog,
      quickActions: quickActions(),
      recent: readRecent(),
      pathname: loc.pathname,
      canAccess: (href) => canAccessHref(auth.me, href),
    }),
  );

  createEffect(() => {
    results();
    setActive((i) => {
      const max = results().length - 1;
      return max < 0 ? 0 : Math.min(i, max);
    });
  });

  const pick = (item: PaletteItem) => {
    const needle = q().trim();
    props.onClose();
    setQ("");

    switch (item.kind) {
      case "nav":
        pushRecent(item.entry);
        navigate(item.entry.href);
        return;
      case "help":
        navigate(item.href);
        return;
      case "ask":
        helpUi?.openWithQuery(item.query);
        return;
      case "goto":
        pushRecent({ label: item.path, href: item.path, group: "Go to" });
        navigate(item.path);
        return;
      case "sitemap":
        navigate(`/app/dashboard/site-map?q=${encodeURIComponent(item.query)}`);
        return;
    }
  };

  const submitQuery = () => {
    const needle = q().trim();
    if (!needle) return;
    const hit = results()[active()];
    if (hit) {
      pick(hit);
      return;
    }
    helpUi?.openWithQuery(needle);
    props.onClose();
    setQ("");
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
        setActive((i) => Math.min(i + 1, Math.max(0, results().length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        submitQuery();
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
              ref={inputEl}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              class="w-full border-0 bg-transparent text-sm outline-none placeholder:text-text-secondary"
              placeholder="Search screens, help, paths (/app/…), or type any question…"
              value={q()}
              onInput={(e) => {
                setQ(e.currentTarget.value);
                setActive(0);
              }}
            />
            <p class="mt-1 text-xs text-text-secondary">
              ↑↓ navigate · Enter open · Esc close · any text can go to Baiko
            </p>
          </div>
          <ul class="max-h-80 overflow-y-auto py-1">
            <Show when={results().length === 0}>
              <li class="px-4 py-6 text-center text-sm text-text-secondary">
                Type a screen name, help question, or path like <code class="text-xs">/app/sales/sales</code>.
              </li>
            </Show>
            <For each={results()}>
              {(item, i) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left text-sm"
                    classList={{
                      "bg-brand-50 text-brand-700": active() === i(),
                      "text-text-primary hover:bg-slate-50": active() !== i(),
                    }}
                    onMouseEnter={() => setActive(i())}
                    onClick={() => pick(item)}
                  >
                    <span class="min-w-0">
                      <span class="block truncate">{paletteItemLabel(item)}</span>
                      <Show when={paletteItemDetail(item)}>
                        {(detail) => (
                          <span class="mt-0.5 block truncate text-xs text-text-secondary">{detail()}</span>
                        )}
                      </Show>
                    </span>
                    <span class="shrink-0 pt-0.5 text-xs text-text-secondary">{paletteItemGroup(item)}</span>
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
