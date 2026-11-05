import { A, useLocation } from "@solidjs/router";
import { For } from "solid-js";
const TABS = [
  { href: "/app/hr/clients", label: "Clients & sites", match: (p: string) => p === "/app/hr/clients" || p.endsWith("/hr/clients") },
  { href: "/app/hr/contracts", label: "Contracts & job orders", match: (p: string) => p.includes("/hr/contracts") },
  { href: "/app/hr/manpower-requests", label: "Manpower requests", match: (p: string) => p.includes("/hr/manpower-requests") },
  { href: "/app/hr/clients/portal-access", label: "Portal access", match: (p: string) => p.includes("/portal-access") },
] as const;

export function ClientsDeploymentTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="Clients & deployment">
      <For each={[...TABS]}>
        {(tab) => (
          <A href={tab.href} classList={{ on: tab.match(path()) }} aria-current={tab.match(path()) ? "page" : undefined}>
            {tab.label}
          </A>
        )}
      </For>
    </nav>
  );
}
