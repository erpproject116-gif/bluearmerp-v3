import { A, useLocation } from "@solidjs/router";
import { For, Show, type ParentComponent } from "solid-js";

const groups = [
  { label: "Overview", links: [{ label: "Overview", href: "/app/hr", exact: true }] },
  {
    label: "People",
    links: [
      { label: "Employees", href: "/app/hr/employees" },
      { label: "Applicants", href: "/app/hr/applicants" },
      { label: "Onboarding", href: "/app/hr/hire-onboarding" },
    ],
  },
  {
    label: "Time and leave",
    links: [
      { label: "Attendance", href: "/app/hr/attendance" },
      { label: "Leave", href: "/app/hr/leave" },
    ],
  },
  {
    label: "Cases",
    links: [
      { label: "Workplace problems", href: "/app/hr/workplace-problems" },
      { label: "Discipline", href: "/app/hr/discipline" },
      { label: "Absenteeism", href: "/app/hr/absenteeism" },
    ],
  },
  { label: "Requests", links: [{ label: "Requests", href: "/app/hr/requests" }] },
  {
    label: "Evaluations and learning",
    links: [
      { label: "Evaluations", href: "/app/hr/evaluations" },
      { label: "Learning", href: "/app/hr/learning" },
    ],
  },
  {
    label: "Payroll",
    links: [
      { label: "Payroll", href: "/app/hr/payroll-runs" },
      { label: "Pay items", href: "/app/hr/pay-items" },
      { label: "Remittances", href: "/app/hr/remittances" },
      { label: "13th / Final pay", href: "/app/hr/special-runs" },
    ],
  },
  { label: "Reports", links: [{ label: "Reports", href: "/app/hr/reports" }] },
  { label: "Policies", links: [{ label: "Policies & notices", href: "/app/hr/records" }] },
  { label: "My HR", links: [{ label: "My HR", href: "/app/hr/ess" }] },
] as const;

const attendanceTabs = [
  { label: "Overview", href: "/app/hr/attendance/overview" },
  { label: "DTR entry", href: "/app/hr/attendance/entry" },
  { label: "Setup", href: "/app/hr/attendance/setup" },
] as const;

function linkActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/app/hr") return pathname === "/app/hr";
  if (href === "/app/hr/attendance") return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const HrLayout: ParentComponent = (props) => {
  const loc = useLocation();
  const onAttendance = () => loc.pathname === "/app/hr/attendance" || loc.pathname.startsWith("/app/hr/attendance/");
  return (
    <div class="md:flex md:items-start md:gap-6">
      <nav class="mb-4 md:mb-0 md:w-56 md:shrink-0" aria-label="HR and Payroll">
        <div class="flex gap-4 overflow-x-auto md:block">
          <For each={groups}>
            {(group) => (
              <div class="mb-3 min-w-max md:min-w-0">
                <p class="mb-1 text-xs text-text-secondary">{group.label}</p>
                <For each={group.links}>
                  {(item) => (
                    <A
                      href={item.href}
                      class="block rounded-lg px-3 py-1.5 text-sm text-text-secondary"
                      classList={{ "bg-brand-50 text-brand-700": linkActive(loc.pathname, item.href, "exact" in item && item.exact) }}
                    >
                      {item.label}
                    </A>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </nav>
      <div class="min-w-0 flex-1">
        <Show when={onAttendance()}>
          <div class="mb-4 flex gap-2 overflow-x-auto">
            <For each={attendanceTabs}>
              {(tab) => (
                <A
                  href={tab.href}
                  class="rounded-lg px-3 py-1.5 text-sm text-text-secondary"
                  classList={{ "bg-brand-50 text-brand-700": loc.pathname === tab.href }}
                >
                  {tab.label}
                </A>
              )}
            </For>
          </div>
        </Show>
        {props.children}
      </div>
    </div>
  );
};
