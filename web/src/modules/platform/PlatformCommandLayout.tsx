import { type ParentComponent, For, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { useAuth } from "../../shared/auth-context";

const NAV = [
  { href: "/app/platform-command", label: "Overview", exact: true },
  { href: "/app/platform-command/analytics", label: "Analytics" },
  { href: "/app/platform-command/customers", label: "Customers" },
  { href: "/app/platform-command/day1-payments", label: "Day 1 payments" },
  { href: "/app/platform-command/tickets", label: "Tickets" },
  { href: "/app/platform-command/onboarding", label: "Onboarding" },
  { href: "/app/platform-command/follow-ups", label: "Follow-ups" },
  { href: "/app/platform-command/history", label: "History" },
  { href: "/app/platform-command/change-logs", label: "Change logs" },
  { href: "/app/platform-command/plans", label: "Plans" },
  { href: "/app/platform-command/access", label: "Staff & access" },
];

export const PlatformCommandLayout: ParentComponent = (props) => {
  const loc = useLocation();
  const auth = useAuth();
  const active = (href: string, exact?: boolean) =>
    exact ? loc.pathname === href : loc.pathname === href || loc.pathname.startsWith(href + "/");

  return (
    <div class="min-h-screen bg-slate-50 text-slate-900">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Bluearm Platform</p>
            <h1 class="text-lg font-semibold">Command Center</h1>
          </div>
          <div class="text-right text-sm text-slate-600">
            <p class="font-medium">{auth.me?.user.full_name}</p>
            <p class="text-xs">{auth.me?.user.email} · {auth.me?.user.platform_role || "staff"}</p>
          </div>
        </div>
        <nav class="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          <For each={NAV}>
            {(item) => (
              <A
                href={item.href}
                class="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                classList={{
                  "bg-slate-900 text-white hover:bg-slate-800": active(item.href, item.exact),
                }}
              >
                {item.label}
              </A>
            )}
          </For>
          <Show when={!auth.me?.user.platform_only}>
            <A href="/app/dashboard" class="ml-auto whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
              Back to ERP
            </A>
          </Show>
        </nav>
      </header>
      <main class="mx-auto max-w-7xl px-4 py-6">{props.children}</main>
    </div>
  );
};

export default PlatformCommandLayout;
