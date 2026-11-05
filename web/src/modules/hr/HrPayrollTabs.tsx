import { A, useLocation } from "@solidjs/router";
import { For } from "solid-js";

const TABS = [
  {
    href: "/app/hr/payroll-runs",
    label: "Runs",
    match: (p: string) => p.includes("/hr/payroll-runs"),
  },
  {
    href: "/app/hr/pay-items",
    label: "Pay items",
    match: (p: string) => p.includes("/hr/pay-items"),
  },
  {
    href: "/app/hr/remittances",
    label: "Remittances",
    match: (p: string) => p.includes("/hr/remittances"),
  },
  {
    href: "/app/hr/special-runs",
    label: "Special runs",
    match: (p: string) => p.includes("/hr/special-runs"),
  },
  {
    href: "/app/hr/client-billing",
    label: "Client billing",
    match: (p: string) => p.includes("/hr/client-billing"),
  },
] as const;

export function HrPayrollTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="Payroll">
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
