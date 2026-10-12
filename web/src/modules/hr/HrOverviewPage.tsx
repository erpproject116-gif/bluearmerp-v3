import { A } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { HrLayout } from "./HrLayout";

type Overview = {
  active_employees: number;
  open_discipline_cases: number;
  pending_leave: number;
  open_absence_alerts: number;
};

const cards = [
  { key: "active_employees", label: "Active employees", href: "/app/hr/employees" },
  { key: "open_discipline_cases", label: "Open discipline cases", href: "/app/hr/discipline" },
  { key: "pending_leave", label: "Pending leave", href: "/app/hr/leave" },
  { key: "open_absence_alerts", label: "Open absenteeism alerts", href: "/app/hr/absenteeism" },
] as const;

export default function HrOverviewPage() {
  const overview = createQuery(() => ({
    queryKey: ["hr-overview"],
    queryFn: async () => (await apiFetch<Overview>("/api/v1/hr/overview")).data,
  }));

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">HR</h1>
      <p class="mb-6 text-sm text-text-secondary">
        Headcount and open work. Pay amounts stay on Payroll.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <For each={cards}>
          {(card) => (
            <A href={card.href} class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:bg-slate-50">
              <p class="text-sm text-text-secondary">{card.label}</p>
              <p class="mt-1 text-2xl font-semibold">{overview.data?.[card.key] ?? "—"}</p>
            </A>
          )}
        </For>
      </div>
      <A href="/app/hr/reports" class="mt-4 inline-block text-sm text-brand-700 hover:underline">
        Discipline report
      </A>
    </HrLayout>
  );
}
