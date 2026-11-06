import { A, useLocation } from "@solidjs/router";
import { createMemo, For } from "solid-js";
import { isAgencyPath, useManpowerMode } from "./manpowerMode";

const TABS = [
  {
    href: "/app/hr/attendance/overview",
    label: "Overview",
    match: (p: string) => p.includes("/attendance/overview") || p.includes("/attendance/employees/"),
  },
  {
    href: "/app/hr/attendance/entry",
    label: "DTR entry",
    match: (p: string) => p.includes("/attendance/entry"),
  },
  {
    href: "/app/hr/attendance/client-dtr",
    label: "Client DTR",
    match: (p: string) => p.includes("/attendance/client-dtr"),
  },
  {
    href: "/app/hr/attendance/setup",
    label: "Setup",
    match: (p: string) => p.includes("/attendance/setup"),
  },
] as const;

export function HrAttendanceTabs() {
  const loc = useLocation();
  const mode = useManpowerMode();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  const tabs = createMemo(() =>
    TABS.filter((tab) => mode.enabled() || !isAgencyPath(tab.href)),
  );
  return (
    <nav class="hr-ptabs" aria-label="Attendance / DTR">
      <For each={tabs()}>
        {(tab) => (
          <A href={tab.href} classList={{ on: tab.match(path()) }} aria-current={tab.match(path()) ? "page" : undefined}>
            {tab.label}
          </A>
        )}
      </For>
    </nav>
  );
}
