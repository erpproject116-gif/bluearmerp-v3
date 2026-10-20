import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import {
  currentYearMonth,
  dtrDutyCellClass,
  dtrStatusLetter,
  monthBounds,
  type MonthDayCell,
  type MonthOverviewRow,
} from "./attendanceShared";

type Density = "S" | "M" | "L";

const densityPx: Record<Density, { day: number; padY: number; padX: number; row: number; font: number }> = {
  S: { day: 28, padY: 2, padX: 2, row: 28, font: 11 },
  M: { day: 36, padY: 4, padX: 4, row: 36, font: 12 },
  L: { day: 48, padY: 8, padX: 6, row: 44, font: 13 },
};

export default function AttendanceOverviewPage() {
  const [overviewMonth, setOverviewMonth] = createSignal(currentYearMonth());
  const [density, setDensity] = createSignal<Density>("M");
  const [empColW, setEmpColW] = createSignal(220);
  const [deptColW, setDeptColW] = createSignal(110);
  const [jobColW, setJobColW] = createSignal(160);
  const overviewBounds = () => monthBounds(overviewMonth());

  const size = createMemo(() => densityPx[density()]);

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

  const cellByDay = (row: MonthOverviewRow) => {
    const map = new Map<number, MonthDayCell>();
    for (const cell of row.days ?? []) map.set(cell.day, cell);
    return map;
  };

  const tableMinW = () => {
    const days = dayNums().length * size().day;
    return empColW() + deptColW() + jobColW() + days + 10 * 56;
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
            Scroll sideways for all days.{" "}
            <span class="inline-flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> full day (≥8h)
            </span>
            {", "}
            <span class="inline-flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-sm bg-orange-400" /> half-day
            </span>
            {", "}
            <span class="inline-flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded-sm bg-red-500" /> absent / AWOL
            </span>
            . Open a name for the DTR log.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <Field label="Month">
            <input
              type="month"
              class={inputClass}
              value={overviewMonth()}
              onInput={(e) => setOverviewMonth(e.currentTarget.value)}
            />
          </Field>
          <Field label="Cell size">
            <div class="flex gap-1">
              <For each={(["S", "M", "L"] as Density[])}>
                {(d) => (
                  <button
                    type="button"
                    class={`min-w-9 rounded-lg border px-2 py-1.5 text-sm ${
                      density() === d
                        ? "border-brand-600 bg-brand-50 font-semibold text-brand-800"
                        : "border-stroke text-text-secondary hover:bg-slate-50"
                    }`}
                    onClick={() => setDensity(d)}
                  >
                    {d}
                  </button>
                )}
              </For>
            </div>
          </Field>
        </div>
      </div>

      <div class="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm">
        <label class="flex items-center gap-2">
          <span class="text-text-secondary">Employee col</span>
          <input
            type="range"
            min="140"
            max="360"
            step="10"
            value={empColW()}
            onInput={(e) => setEmpColW(Number(e.currentTarget.value))}
          />
          <span class="w-10 tabular-nums text-text-secondary">{empColW()}</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-text-secondary">Dept</span>
          <input
            type="range"
            min="70"
            max="200"
            step="10"
            value={deptColW()}
            onInput={(e) => setDeptColW(Number(e.currentTarget.value))}
          />
          <span class="w-10 tabular-nums text-text-secondary">{deptColW()}</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-text-secondary">Job title</span>
          <input
            type="range"
            min="80"
            max="280"
            step="10"
            value={jobColW()}
            onInput={(e) => setJobColW(Number(e.currentTarget.value))}
          />
          <span class="w-10 tabular-nums text-text-secondary">{jobColW()}</span>
        </label>
      </div>

      <section class="rounded-xl border border-stroke bg-white shadow-sm">
        <div
          class="max-h-[min(70vh,720px)] overflow-auto overscroll-contain"
          style={{ "scrollbar-gutter": "stable" }}
        >
          <table
            class="border-separate border-spacing-0 text-left"
            style={{
              "min-width": `${tableMinW()}px`,
              "font-size": `${size().font}px`,
            }}
          >
            <thead>
              <tr class="border-b border-stroke text-xs font-semibold uppercase text-text-secondary">
                <th
                  class="sticky left-0 top-0 z-30 border-b border-r border-stroke bg-white py-2 pr-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                  style={{ width: `${empColW()}px`, "min-width": `${empColW()}px`, "max-width": `${empColW()}px` }}
                >
                  Employee
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-3"
                  style={{ width: `${deptColW()}px`, "min-width": `${deptColW()}px` }}
                >
                  Dept
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-3"
                  style={{ width: `${jobColW()}px`, "min-width": `${jobColW()}px` }}
                >
                  Job title
                </th>
                <For each={dayNums()}>
                  {(d) => (
                    <th
                      class="sticky top-0 z-20 border-b border-stroke bg-white text-center tabular-nums"
                      style={{
                        width: `${size().day}px`,
                        "min-width": `${size().day}px`,
                        padding: `${size().padY}px ${size().padX}px`,
                      }}
                    >
                      {d}
                    </th>
                  )}
                </For>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pl-2 pr-2 text-right">Present</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Absent</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">AWOL</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Leave</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Holiday</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Rest</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Short</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">OT</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 pr-2 text-right">Night</th>
                <th class="sticky top-0 z-20 border-b border-stroke bg-white py-2 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={(monthOverview.data?.rows ?? []).length > 0}
                fallback={
                  <tr>
                    <td colSpan={14 + dayNums().length} class="px-3 py-4 text-text-secondary">
                      {monthOverview.isFetching ? "Loading…" : "No active employees."}
                    </td>
                  </tr>
                }
              >
                <For each={monthOverview.data?.rows ?? []}>
                  {(row) => {
                    const byDay = cellByDay(row);
                    return (
                      <tr class="hover:bg-slate-50/80" style={{ height: `${size().row}px` }}>
                        <td
                          class="sticky left-0 z-10 border-b border-r border-slate-100 bg-white pr-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                          style={{
                            width: `${empColW()}px`,
                            "min-width": `${empColW()}px`,
                            "max-width": `${empColW()}px`,
                          }}
                        >
                          <A
                            href={`/app/hr/attendance/employees/${row.employee_id}?month=${overviewMonth()}`}
                            class="block truncate font-medium text-brand-700 hover:underline"
                            title={`${row.employee_no} — ${row.employee_name}`}
                          >
                            {row.employee_no} — {row.employee_name}
                          </A>
                        </td>
                        <td
                          class="truncate border-b border-slate-100 pr-3"
                          style={{ width: `${deptColW()}px`, "max-width": `${deptColW()}px` }}
                          title={row.department || undefined}
                        >
                          {row.department || "—"}
                        </td>
                        <td
                          class="truncate border-b border-slate-100 pr-3"
                          style={{ width: `${jobColW()}px`, "max-width": `${jobColW()}px` }}
                          title={row.job_title || undefined}
                        >
                          {row.job_title || "—"}
                        </td>
                        <For each={dayNums()}>
                          {(d) => {
                            const cell = byDay.get(d);
                            const status = cell?.status ?? "";
                            const hours = cell?.hours_worked ?? 0;
                            const letter = dtrStatusLetter(status);
                            return (
                              <td
                                class={`border-b border-slate-100 text-center font-semibold tabular-nums ${dtrDutyCellClass(status, hours)}`}
                                style={{
                                  width: `${size().day}px`,
                                  "min-width": `${size().day}px`,
                                  padding: `${size().padY}px ${size().padX}px`,
                                }}
                                title={
                                  status
                                    ? `${status}${status === "present" ? ` · ${hours}h` : ""}`
                                    : undefined
                                }
                              >
                                {letter || "·"}
                              </td>
                            );
                          }}
                        </For>
                        <td class="border-b border-slate-100 py-1 pl-2 pr-2 text-right tabular-nums">{row.present_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.absent_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.awol_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.leave_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.holiday_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.rest_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.short_days}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.ot_hours_sum}</td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">{row.night_diff_hours_sum}</td>
                        <td class="border-b border-slate-100 py-1 text-right tabular-nums">{row.hours_worked_sum}</td>
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
