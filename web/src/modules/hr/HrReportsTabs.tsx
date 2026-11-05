import { A, useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import { HrPlanned } from "./HrUi";

const TABS = [
  {
    href: "/app/hr/reports",
    label: "HR reports",
    match: (p: string) => p === "/app/hr/reports" || p.endsWith("/hr/reports"),
    planned: false,
  },
  {
    href: "/app/hr/government-reports",
    label: "Gov't reports",
    match: (p: string) => p.includes("/hr/government-reports"),
    planned: true,
  },
  {
    href: "/app/hr/compliance",
    label: "Compliance docs",
    match: (p: string) => p.includes("/hr/compliance"),
    planned: true,
  },
] as const;

export function HrReportsTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="Reports & compliance">
      <For each={[...TABS]}>
        {(tab) => (
          <A href={tab.href} classList={{ on: tab.match(path()) }} aria-current={tab.match(path()) ? "page" : undefined}>
            {tab.label}
            <Show when={tab.planned}>
              {" "}
              <HrPlanned />
            </Show>
          </A>
        )}
      </For>
    </nav>
  );
}
