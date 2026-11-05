import { A, useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import { HrPlanned } from "./HrUi";

const TABS = [
  {
    href: "/app/hr/attendance/overview",
    label: "Overview",
    match: (p: string) => p.includes("/attendance/overview") || p.includes("/attendance/employees/"),
    planned: false,
  },
  {
    href: "/app/hr/attendance/entry",
    label: "DTR entry",
    match: (p: string) => p.includes("/attendance/entry"),
    planned: false,
  },
  {
    href: "/app/hr/attendance/client-dtr",
    label: "Client DTR inbox",
    match: (p: string) => p.includes("/attendance/client-dtr"),
    planned: true,
  },
  {
    href: "/app/hr/attendance/setup",
    label: "Setup",
    match: (p: string) => p.includes("/attendance/setup"),
    planned: false,
  },
] as const;

export function HrAttendanceTabs() {
  const loc = useLocation();
  const path = () => loc.pathname.replace(/\/+$/, "") || "/";
  return (
    <nav class="hr-ptabs" aria-label="Attendance / DTR">
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
      <span class="hr-ptabs-planned" title="Mockup gallery of DTR layouts">
        DTR designs (6) <HrPlanned />
      </span>
    </nav>
  );
}
