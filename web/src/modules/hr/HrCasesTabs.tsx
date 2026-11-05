import { A, useLocation } from "@solidjs/router";
import { For } from "solid-js";

const TABS = [
  {
    href: "/app/hr/workplace-problems",
    label: "Workplace problems",
    match: (p: string) => p.includes("/hr/workplace-problems"),
  },
  {
    href: "/app/hr/discipline",
    label: "Discipline",
    match: (p: string) => p.includes("/hr/discipline"),
  },
  {
    href: "/app/hr/absenteeism",
    label: "Absenteeism",
    match: (p: string) => p.includes("/hr/absenteeism"),
  },
] as const;

export function HrCasesTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="HR cases">
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
