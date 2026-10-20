import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import {
  currentYearMonth,
  dtrStatusCellClass,
  dtrStatusLetter,
  monthBounds,
  type MonthOverviewRow,
} from "./attendanceShared";

export default function AttendanceOverviewPage() {
  const [overviewMonth, setOverviewMonth] = createSignal(currentYearMonth());
  const overviewBounds = () => monthBounds(overviewMonth());

  const monthOverview = createQuery(() => {
    const b = overviewBounds();
    return {
      queryKey: ["hr-dtr-month-overview", b?.year, b?.month],
      enabled: Boolean(b),
      queryFn: async () => {
        if (!b) return { rows: [] as MonthOverviewRow[], days_in_month: 0 };
        const res = await apiFetch<{ rows: MonthOverviewRow[]; days_in_month: number }>(
          `/api/v1/hr/dtr/month-overview?year=${b.year}&month=${b.month}`,
          {},
          { silent: true },
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load month overview");
        return {
          rows: res.data?.rows ?? [],
          days_in_month: res.data?.days_in_month ?? b.daysInMonth,
        };
      },
    };
  });

  const dayNums = () => {
    const n = monthOverview.data?.days_in_month ?? overviewBounds()?.daysInMonth ?? 31;
    return Array.from({ length: n }, (_, i) => i + 1);
  };

  const statusByDay = (row: MonthOverviewRow) => {
    const map = new Map<number, string>();
    for (const cell of row.days ?? []) map.set(cell.day, cell.status);
    return map;
  };

  return (
    <HrLayout>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <A href="/app/hr/attendance" class="text-sm text-brand-700 hover:underline">
            ← Attendance
          </A>
          <h1 class="mt-1 text-2xl font-semibold">Month overview</h1>
          <p class="mt-1 text-sm text-text-secondary">
            All active employees. Day letters: P present, A absent, W AWOL, L leave, H holiday, R rest. Short day =
            present under 8 hours. Open a name for the full DTR log.
          </p>
        </div>
        <Field label="Month">
          <input
            type="month"
            class={inputClass}
            value={overviewMonth()}
            onInput={(e) => setOverviewMonth(e.currentTarget.value)}
          />
        </Field>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead>
              <tr class="border-b border-stroke text-xs font-semibold uppercase text-text-secondary">
                <th class="sticky left-0 z-10 bg-white py-2 pr-3">Employee</th>
                <th class="py-2 pr-3">Dept</th>
                <th class="py-2 pr-3">Job title</th>
                <For each={dayNums()}>
                  {(d) => <th class="px-1 py-2 text-center tabular-nums">{d}</th>}
                </For>
                <th class="py-2 pl-2 pr-2 text-right">Present</th>
                <th class="py-2 pr-2 text-right">Absent</th>
                <th class="py-2 pr-2 text-right">AWOL</th>
                <th class="py-2 pr-2 text-right">Leave</th>
                <th class="py-2 pr-2 text-right">Holiday</th>
                <th class="py-2 pr-2 text-right">Rest</th>
                <th class="py-2 pr-2 text-right">Short</th>
                <th class="py-2 pr-2 text-right">OT</th>
                <th class="py-2 pr-2 text-right">Night</th>
                <th class="py-2 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={(monthOverview.data?.rows ?? []).length > 0}
                fallback={
                  <tr>
                    <td colSpan={14 + dayNums().length} class="py-3 text-text-secondary">
                      {monthOverview.isFetching ? "Loading…" : "No active employees."}
                    </td>
                  </tr>
                }
              >
                <For each={monthOverview.data?.rows ?? []}>
                  {(row) => {
                    const byDay = statusByDay(row);
                    return (
                      <tr class="border-b border-slate-100 hover:bg-slate-50">
                        <td class="sticky left-0 z-10 bg-white py-2 pr-3">
                          <A
                            href={`/app/hr/attendance/employees/${row.employee_id}?month=${overviewMonth()}`}
                            class="font-medium text-brand-700 hover:underline"
                          >
                            {row.employee_no} — {row.employee_name}
                          </A>
                        </td>
                        <td class="py-2 pr-3">{row.department || "—"}</td>
                        <td class="py-2 pr-3">{row.job_title || "—"}</td>
                        <For each={dayNums()}>
                          {(d) => {
                            const status = byDay.get(d) ?? "";
                            const letter = dtrStatusLetter(status);
                            return (
                              <td class={`px-1 py-1 text-center text-xs font-semibold tabular-nums ${dtrStatusCellClass(status)}`}>
                                {letter || "·"}
                              </td>
                            );
                          }}
                        </For>
                        <td class="py-2 pl-2 pr-2 text-right tabular-nums">{row.present_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.absent_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.awol_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.leave_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.holiday_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.rest_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.short_days}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.ot_hours_sum}</td>
                        <td class="py-2 pr-2 text-right tabular-nums">{row.night_diff_hours_sum}</td>
                        <td class="py-2 text-right tabular-nums">{row.hours_worked_sum}</td>
                      </tr>
                    );
                  }}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </section>
    </HrLayout>
  );
}
