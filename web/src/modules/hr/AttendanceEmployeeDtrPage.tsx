import { A, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { currentYearMonth, monthBounds, type EmployeeMonthLine } from "./attendanceShared";

type EmployeeMonthPayload = {
  year: number;
  month: number;
  employee: {
    id: number;
    employee_no: string;
    employee_name: string;
    department: string;
    job_title: string;
  };
  totals: {
    hours_worked_sum: number;
    ot_hours_sum: number;
    night_diff_hours_sum: number;
    absent_days: number;
  };
  lines: EmployeeMonthLine[];
};

export default function AttendanceEmployeeDtrPage() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const employeeId = () => Number(params.employeeId);

  const overviewMonth = createMemo(() => {
    const fromUrl = search.month;
    const raw = Array.isArray(fromUrl) ? fromUrl[0] : fromUrl;
    if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) return raw;
    return currentYearMonth();
  });

  const bounds = () => monthBounds(overviewMonth());

  const log = createQuery(() => {
    const b = bounds();
    const empId = employeeId();
    return {
      queryKey: ["hr-dtr-employee-month", empId, b?.year, b?.month],
      enabled: Boolean(b && empId > 0),
      queryFn: async () => {
        if (!b || !(empId > 0)) return null;
        const res = await apiFetch<EmployeeMonthPayload>(
          `/api/v1/hr/dtr/employee-month?employee_id=${empId}&year=${b.year}&month=${b.month}`,
          {},
          { silent: true },
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load DTR log");
        return res.data ?? null;
      },
    };
  });

  return (
    <HrLayout>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <A href={`/app/hr/attendance/overview`} class="text-sm text-brand-700 hover:underline">
            ← Month overview
          </A>
          <Show
            when={log.data?.employee}
            fallback={<h1 class="mt-1 text-2xl font-semibold">Employee DTR log</h1>}
          >
            {(emp) => (
              <>
                <h1 class="mt-1 text-2xl font-semibold">
                  {emp().employee_no} — {emp().employee_name}
                </h1>
                <p class="mt-1 text-sm text-text-secondary">
                  {[emp().department, emp().job_title].filter(Boolean).join(" · ") || "—"}
                </p>
              </>
            )}
          </Show>
          <p class="mt-1 text-sm text-text-secondary">
            Sched / Late / UT need shift schedules — not shown yet. Actual In/Out come from biometric punches when
            present.
          </p>
        </div>
        <Field label="Month">
          <input
            type="month"
            class={inputClass}
            value={overviewMonth()}
            onInput={(e) => {
              setSearch({ month: e.currentTarget.value }, { replace: true });
            }}
          />
        </Field>
      </div>

      <Show when={log.data?.totals}>
        {(t) => (
          <div class="mb-4 grid gap-3 sm:grid-cols-4">
            <div class="rounded-xl border border-stroke bg-white p-3 shadow-sm">
              <p class="text-xs text-text-secondary">Hours</p>
              <p class="text-lg font-semibold tabular-nums">{t().hours_worked_sum}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-3 shadow-sm">
              <p class="text-xs text-text-secondary">OT</p>
              <p class="text-lg font-semibold tabular-nums">{t().ot_hours_sum}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-3 shadow-sm">
              <p class="text-xs text-text-secondary">Night diff</p>
              <p class="text-lg font-semibold tabular-nums">{t().night_diff_hours_sum}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-3 shadow-sm">
              <p class="text-xs text-text-secondary">Absent / AWOL days</p>
              <p class="text-lg font-semibold tabular-nums">{t().absent_days}</p>
            </div>
          </div>
        )}
      </Show>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead>
              <tr class="border-b border-stroke text-xs font-semibold uppercase text-text-secondary">
                <th class="py-2 pr-3">Date</th>
                <th class="py-2 pr-3">Day</th>
                <th class="py-2 pr-3">Status</th>
                <th class="py-2 pr-3">Actual In</th>
                <th class="py-2 pr-3">Actual Out</th>
                <th class="py-2 pr-2 text-right">Hours</th>
                <th class="py-2 pr-2 text-right">OT</th>
                <th class="py-2 pr-2 text-right">Night</th>
                <th class="py-2 pr-3">Holiday</th>
                <th class="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={(log.data?.lines ?? []).length > 0}
                fallback={
                  <tr>
                    <td colSpan={10} class="py-3 text-text-secondary">
                      {log.isFetching ? "Loading…" : log.isError ? "Could not load DTR log." : "No DTR rows this month."}
                    </td>
                  </tr>
                }
              >
                <For each={log.data?.lines ?? []}>
                  {(line) => (
                    <tr class="border-b border-slate-100">
                      <td class="py-2 pr-3 tabular-nums">{line.work_date.slice(0, 10)}</td>
                      <td class="py-2 pr-3">{line.weekday || "—"}</td>
                      <td class="py-2 pr-3">{line.status}</td>
                      <td class="py-2 pr-3 tabular-nums">{line.actual_in || "—"}</td>
                      <td class="py-2 pr-3 tabular-nums">{line.actual_out || "—"}</td>
                      <td class="py-2 pr-2 text-right tabular-nums">{line.hours_worked}</td>
                      <td class="py-2 pr-2 text-right tabular-nums">{line.ot_hours}</td>
                      <td class="py-2 pr-2 text-right tabular-nums">{line.night_diff_hours}</td>
                      <td class="py-2 pr-3">{line.holiday_name || "—"}</td>
                      <td class="py-2">{line.absence_reason || "—"}</td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </section>
    </HrLayout>
  );
}
