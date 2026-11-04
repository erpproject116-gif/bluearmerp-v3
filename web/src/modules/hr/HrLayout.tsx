import { A, useLocation } from "@solidjs/router";
import { For, type ParentComponent } from "solid-js";

const hrLinks = [
  { label: "Overview", href: "/app/hr" },
  { label: "Employees", href: "/app/hr/employees" },
  { label: "Applicants", href: "/app/hr/applicants" },
  { label: "Hire onboarding", href: "/app/hr/hire-onboarding" },
  { label: "Attendance / DTR", href: "/app/hr/attendance" },
  { label: "Leave", href: "/app/hr/leave" },
  { label: "Policies & notices", href: "/app/hr/records" },
  { label: "Absenteeism", href: "/app/hr/absenteeism" },
  { label: "Discipline", href: "/app/hr/discipline" },
  { label: "Workplace problems", href: "/app/hr/workplace-problems" },
  { label: "Requests", href: "/app/hr/requests" },
  { label: "Evaluations", href: "/app/hr/evaluations" },
  { label: "Learning", href: "/app/hr/learning" },
  { label: "Pay items", href: "/app/hr/pay-items" },
  { label: "Payroll", href: "/app/hr/payroll-runs" },
  { label: "13th / Final pay", href: "/app/hr/special-runs" },
  { label: "Remittances", href: "/app/hr/remittances" },
  { label: "Reports", href: "/app/hr/reports" },
  { label: "My HR (ESS)", href: "/app/hr/ess" },
] as const;

export const HrLayout: ParentComponent = (props) => {
  const loc = useLocation();
  return (
    <div>
      <nav class="mb-4 flex flex-wrap gap-1" aria-label="HR and Payroll">
        <For each={hrLinks}>
          {(item) => (
            <A
              href={item.href}
              class="rounded-lg px-3 py-1.5 text-sm text-text-secondary"
              classList={{ "bg-brand-50 text-brand-700": loc.pathname === item.href }}
            >
              {item.label}
            </A>
          )}
        </For>
      </nav>
      {props.children}
    </div>
  );
};
