import { A, useLocation } from "@solidjs/router";
import { For } from "solid-js";

const TABS = [
  {
    href: "/app/hr/evaluations",
    label: "Evaluations",
    match: (p: string) => p.includes("/hr/evaluations"),
  },
  {
    href: "/app/hr/learning",
    label: "Learning",
    match: (p: string) => p.includes("/hr/learning"),
  },
] as const;

export function HrPerformanceTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="Evaluations and learning">
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
