import { A, useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import { isAgencyPath, useManpowerMode } from "../modules/hr/manpowerMode";
import { elevatedTenantAdmin, useAuth } from "../shared/auth-context";

type PageLink = { label: string; href: string; exact?: boolean };

type HrGroup = {
  label: string;
  href: string;
  paths: string[];
  pages?: PageLink[];
};

const groups: HrGroup[] = [
  {
    label: "People",
    href: "/app/hr/employees",
    paths: ["/app/hr/employees", "/app/hr/applicants", "/app/hr/hire-onboarding", "/app/hr/offboarding"],
    pages: [
      { label: "Employees", href: "/app/hr/employees" },
      { label: "Applicants", href: "/app/hr/applicants" },
      { label: "Onboarding", href: "/app/hr/hire-onboarding" },
      { label: "Offboarding", href: "/app/hr/offboarding" },
    ],
  },
  {
    label: "Clients",
    href: "/app/hr/clients",
    paths: ["/app/hr/clients", "/app/hr/contracts", "/app/hr/manpower-requests"],
    pages: [
      { label: "Clients & sites", href: "/app/hr/clients", exact: true },
      { label: "Contracts & job orders", href: "/app/hr/contracts" },
      { label: "Manpower requests", href: "/app/hr/manpower-requests" },
      { label: "Portal access", href: "/app/hr/clients/portal-access" },
    ],
  },
  {
    label: "Deployments",
    href: "/app/hr/deployments",
    paths: ["/app/hr/deployments", "/app/hr/workforce"],
    pages: [
      { label: "Roster", href: "/app/hr/deployments" },
      { label: "Workforce board", href: "/app/hr/workforce" },
    ],
  },
  {
    label: "Time and leave",
    href: "/app/hr/attendance/overview",
    paths: ["/app/hr/attendance", "/app/hr/leave"],
    pages: [
      { label: "Month overview", href: "/app/hr/attendance/overview", exact: true },
      { label: "DTR entry", href: "/app/hr/attendance/entry" },
      { label: "Setup", href: "/app/hr/attendance/setup" },
      { label: "Client DTR", href: "/app/hr/attendance/client-dtr" },
      { label: "Leave", href: "/app/hr/leave" },
    ],
  },
  {
    label: "Cases",
    href: "/app/hr/workplace-problems",
    paths: ["/app/hr/workplace-problems", "/app/hr/discipline", "/app/hr/absenteeism"],
    pages: [
      { label: "Workplace problems", href: "/app/hr/workplace-problems" },
      { label: "Discipline", href: "/app/hr/discipline" },
      { label: "Absenteeism", href: "/app/hr/absenteeism" },
    ],
  },
  { label: "Requests", href: "/app/hr/requests", paths: ["/app/hr/requests"] },
  {
    label: "Evaluations and learning",
    href: "/app/hr/evaluations",
    paths: ["/app/hr/evaluations", "/app/hr/learning"],
    pages: [
      { label: "Evaluations", href: "/app/hr/evaluations" },
      { label: "Learning", href: "/app/hr/learning" },
    ],
  },
  {
    label: "Payroll",
    href: "/app/hr/payroll-runs",
    paths: ["/app/hr/payroll-runs", "/app/hr/pay-items", "/app/hr/remittances", "/app/hr/special-runs", "/app/hr/client-billing"],
    pages: [
      { label: "Payroll", href: "/app/hr/payroll-runs" },
      { label: "Pay items", href: "/app/hr/pay-items" },
      { label: "Remittances", href: "/app/hr/remittances" },
      { label: "13th / Final pay", href: "/app/hr/special-runs" },
      { label: "Client billing", href: "/app/hr/client-billing" },
    ],
  },
  {
    label: "Reports",
    href: "/app/hr/reports",
    paths: ["/app/hr/reports", "/app/hr/government-reports", "/app/hr/compliance"],
    pages: [
      { label: "HR reports", href: "/app/hr/reports" },
      { label: "Government reports", href: "/app/hr/government-reports" },
      { label: "Compliance docs", href: "/app/hr/compliance" },
    ],
  },
  { label: "Policies", href: "/app/hr/records", paths: ["/app/hr/records"] },
  { label: "My HR", href: "/app/hr/ess", paths: ["/app/hr/ess"] },
];

function pathUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupActive(pathname: string, group: HrGroup): boolean {
  return group.paths.some((href) => pathUnder(pathname, href));
}

function pageActive(pathname: string, page: PageLink): boolean {
  if (page.exact) return pathname === page.href;
  return pathUnder(pathname, page.href);
}

export function HrHeaderNav() {
  const auth = useAuth();
  const loc = useLocation();
  const mode = useManpowerMode();
  const onHr = () => loc.pathname === "/app/hr" || loc.pathname.startsWith("/app/hr/");
  const activeGroup = () => groups.find((group) => groupActive(loc.pathname, group));
  const pages = () =>
    (activeGroup()?.pages ?? []).filter(
      (page) => elevatedTenantAdmin(auth.me) || mode.enabled() || !isAgencyPath(page.href),
    );
  return (
    <Show when={onHr() && pages().length > 0}>
      <Show when={pages()}>
        {(list) => (
          <nav class="erp-header-features mt-3" aria-label="HR and Payroll pages">
            <For each={list()}>
              {(page) => (
                <A
                  href={page.href}
                  class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                  classList={{
                    "bg-brand-50 text-brand-700": pageActive(loc.pathname, page),
                    "text-text-secondary hover:erp-panel hover:text-text-primary": !pageActive(loc.pathname, page),
                  }}
                >
                  {page.label}
                </A>
              )}
            </For>
          </nav>
        )}
      </Show>
    </Show>
  );
}
