import { A, useLocation } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import {
  canViewCrmNotifications,
  hasModuleAccess,
  hasPermission,
  useAuth,
  type MeData,
} from "../shared/auth-context";
import { isTenantModuleEnabled } from "../shared/moduleAccess";
import { useChatUnreadTotal } from "../modules/comms/useChatUnreadTotal";
import { useShell } from "./shell-context";

type FloorItem = {
  id: string;
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

function hasManufacturingFloorAccess(me: MeData | null | undefined): boolean {
  if (!me || !isTenantModuleEnabled(me, "production")) return false;
  return (
    hasModuleAccess(me, "manufacturing") ||
    hasPermission(me, "manufacturing.work_orders", "read") ||
    hasPermission(me, "manufacturing.boms", "read")
  );
}

function hasInventoryRead(me: MeData | null | undefined): boolean {
  if (!me || !isTenantModuleEnabled(me, "inventory")) return false;
  return hasModuleAccess(me, "inventory") || hasPermission(me, "inventory", "read");
}

function stockHref(me: MeData | null | undefined): string | null {
  if (hasInventoryRead(me)) return "/app/inventory/find-stock";
  if (hasManufacturingFloorAccess(me)) return "/app/production/receive-station";
  return null;
}

function pathActive(pathname: string, href: string, prefix?: string): boolean {
  if (pathname === href || pathname === `${href}/`) return true;
  if (prefix) return pathname === prefix || pathname.startsWith(`${prefix}/`);
  return false;
}

/** Floor-first bottom bar: Home · Production · Stock · Chat · Bell. */
export function FloorBottomNav() {
  const auth = useAuth();
  const loc = useLocation();
  const shell = useShell();
  const chatUnread = useChatUnreadTotal();

  const show = createMemo(() => {
    if (shell.viewport.isStandalone()) return true;
    return shell.viewport.isNarrow() && hasManufacturingFloorAccess(auth.me);
  });

  const items = createMemo((): FloorItem[] => {
    const me = auth.me;
    const list: FloorItem[] = [
      {
        id: "home",
        label: "Home",
        href: "/app/dashboard",
        match: (p) => pathActive(p, "/app/dashboard", "/app/dashboard"),
      },
    ];
    if (hasManufacturingFloorAccess(me)) {
      list.push({
        id: "production",
        label: "Production",
        href: "/app/production",
        match: (p) => pathActive(p, "/app/production", "/app/production"),
      });
    }
    const stock = stockHref(me);
    if (stock) {
      list.push({
        id: "stock",
        label: "Stock",
        href: stock,
        match: (p) =>
          p.startsWith("/app/inventory/find-stock") ||
          p.startsWith("/app/production/receive-station") ||
          p.startsWith("/app/production/issue-station"),
      });
    }
    if (isTenantModuleEnabled(me, "comms") && hasPermission(me, "comms.chat", "read")) {
      list.push({
        id: "chat",
        label: "Chat",
        href: "/app/comms/chat",
        match: (p) => pathActive(p, "/app/comms/chat", "/app/comms"),
      });
    }
    if (canViewCrmNotifications(me)) {
      list.push({
        id: "bell",
        label: "Bell",
        href: "/app/crm/notifications",
        match: (p) => pathActive(p, "/app/crm/notifications", "/app/crm/notifications"),
      });
    }
    return list;
  });

  return (
    <Show when={show() && items().length > 0}>
      <nav
        class="fixed inset-x-0 bottom-0 z-40 border-t border-stroke bg-surface/95 backdrop-blur-sm"
        style={{ "padding-bottom": "env(safe-area-inset-bottom)" }}
        aria-label="Floor navigation"
      >
        <ul class="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
          <For each={items()}>
            {(item) => {
              const active = () => item.match(loc.pathname);
              const badge = () =>
                item.id === "chat" && chatUnread.unreadTotal() > 0
                  ? chatUnread.unreadTotal()
                  : 0;
              return (
                <li class="min-w-0 flex-1">
                  <A
                    href={item.href}
                    class="relative flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium"
                    classList={{
                      "text-brand-700": active(),
                      "text-text-secondary": !active(),
                    }}
                  >
                    <FloorIcon id={item.id} active={active()} />
                    <span class="truncate">{item.label}</span>
                    <Show when={badge() > 0}>
                      <span class="absolute right-2 top-1 min-w-[1.1rem] rounded-full bg-brand-600 px-1 text-center text-[10px] font-semibold text-white">
                        {badge() > 99 ? "99+" : badge()}
                      </span>
                    </Show>
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </nav>
    </Show>
  );
}

function FloorIcon(props: { id: string; active: boolean }) {
  const stroke = () => (props.active ? "currentColor" : "currentColor");
  return (
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={stroke()} stroke-width="2" aria-hidden="true">
      <Show when={props.id === "home"}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
      </Show>
      <Show when={props.id === "production"}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 19h16M7 19V9l5-4 5 4v10M9 19v-4h6v4" />
      </Show>
      <Show when={props.id === "stock"}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16v12H4V7zm0 0l2.5-3h11L20 7M8 11h8" />
      </Show>
      <Show when={props.id === "chat"}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 18l1.5-3A7 7 0 1112 19H7l-2-1z" />
      </Show>
      <Show when={props.id === "bell"}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17H9m6 0a3 3 0 11-6 0m6 0h1a1 1 0 001-1v-1a6 6 0 10-12 0v1a1 1 0 001 1h1" />
      </Show>
    </svg>
  );
}

export function shouldShowFloorBottomNav(
  isStandalone: boolean,
  isNarrow: boolean,
  me: MeData | null | undefined,
): boolean {
  if (isStandalone) return true;
  return isNarrow && hasManufacturingFloorAccess(me);
}
