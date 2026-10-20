import { A } from "@solidjs/router";
import { For } from "solid-js";
import { HrLayout } from "./HrLayout";

const cards = [
  {
    title: "Month overview",
    description: "All active employees in a calendar month — day grid and totals. Open a person for their DTR log.",
    href: "/app/hr/attendance/overview",
  },
  {
    title: "DTR entry",
    description: "Manual day rows, CSV import, and mapped import into the attendance table.",
    href: "/app/hr/attendance/entry",
  },
  {
    title: "Setup",
    description: "Holiday calendar and pay cut-off windows that feed payroll.",
    href: "/app/hr/attendance/setup",
  },
] as const;

export default function AttendanceHubPage() {
  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Attendance / DTR</h1>
      <p class="mb-6 text-sm text-text-secondary">
        Month roster first, then day entry and setup. Late and undertime need schedules — those columns stay out until
        schedules exist.
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <For each={cards}>
          {(card) => (
            <A
              href={card.href}
              class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:bg-slate-50"
            >
              <p class="text-base font-medium text-text-primary">{card.title}</p>
              <p class="mt-2 text-sm text-text-secondary">{card.description}</p>
            </A>
          )}
        </For>
      </div>
    </HrLayout>
  );
}
