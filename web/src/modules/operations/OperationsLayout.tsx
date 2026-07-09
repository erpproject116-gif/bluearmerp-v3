import { A, useLocation } from "@solidjs/router";
import type { ParentComponent } from "solid-js";
import { For } from "solid-js";
import { OperationsWorkspaceProvider } from "./operationsWorkspace";

const TABS = [
  { label: "Work Hub", href: "/app/operations" },
  { label: "Calendar", href: "/app/operations/calendar" },
  { label: "Timeline", href: "/app/operations/timeline" },
  { label: "Dashboard", href: "/app/operations/dashboard" },
  { label: "Automation", href: "/app/operations/automation" },
] as const;

function OperationsLayoutInner(props: { children: import("solid-js").JSX.Element }) {
  const loc = useLocation();
  const isActive = (href: string) =>
    href === "/app/operations"
      ? loc.pathname === href || loc.pathname === "/operations"
      : loc.pathname === href || loc.pathname.startsWith(`${href}/`);

  return (
    <div class="space-y-4">
      <nav class="flex flex-wrap gap-1 border-b border-stroke pb-2">
        <For each={TABS}>
          {(tab) => (
            <A
              href={tab.href}
              class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              classList={{
                "bg-brand-50 text-brand-700": isActive(tab.href),
                "text-text-secondary hover:bg-slate-50 hover:text-text-primary": !isActive(tab.href),
              }}
            >
              {tab.label}
            </A>
          )}
        </For>
      </nav>
      {props.children}
    </div>
  );
}

export const OperationsLayout: ParentComponent = (props) => (
  <OperationsWorkspaceProvider>
    <OperationsLayoutInner>{props.children}</OperationsLayoutInner>
  </OperationsWorkspaceProvider>
);
