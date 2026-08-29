import { A, useLocation } from "@solidjs/router";
import { For, type ParentComponent } from "solid-js";

const TABS = [
  { label: "Workspace", href: "/app/production", exact: true },
  { label: "BOMs", href: "/app/production/boms" },
  { label: "Work Orders", href: "/app/production/work-orders" },
  { label: "Reports", href: "/app/production/reports" },
  { label: "Setup", href: "/app/production/setup" },
] as const;

function tabActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const ProductionLayout: ParentComponent = (props) => {
  const loc = useLocation();
  return (
    <div class="space-y-4">
      <nav class="flex flex-wrap gap-1 border-b border-stroke pb-2" aria-label="Production">
        <For each={[...TABS]}>
          {(tab) => {
            const active = () => tabActive(loc.pathname, tab.href, "exact" in tab ? tab.exact : false);
            return (
              <A
                href={tab.href}
                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-700": active(),
                  "text-text-secondary hover:bg-slate-50 hover:text-text-primary": !active(),
                }}
              >
                {tab.label}
              </A>
            );
          }}
        </For>
      </nav>
      {props.children}
    </div>
  );
};
