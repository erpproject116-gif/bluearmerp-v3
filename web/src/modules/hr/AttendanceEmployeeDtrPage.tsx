import { A, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrPageHead, type HrBadgeTone } from "./HrUi";
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

function statusTone(status: string): HrBadgeTone {
  switch (status) {
    case "present":
      return "success";
    case "absent":
    case "awol":
      return "danger";
    case "holiday":
      return "brand";
    case "leave":
      return "info";
    default:
      return "neutral";
  }
}

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

  const title = () => {
    const emp = log.data?.employee;
    if (!emp) return "Employee DTR log";
    return `${emp.employee_no} — ${emp.employee_name}`;
  };

  const subtitle = () => {
    const emp = log.data?.employee;
    if (!emp) return "Sched / Late / UT need shift schedules — not shown yet.";
    const bits = [emp.department, emp.job_title].filter(Boolean).join(" · ");
    return bits || "Sched / Late / UT need shift schedules — not shown yet.";
  };

  return (
    <HrLayout>
      <HrPageHead
        crumb={
          <A href="/app/hr/attendance/overview" class="text-brand-700 hover:underline">
            ← Month overview
          </A>
        }
        title={title()}
        subtitle={subtitle()}
        actions={
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
        }
      />

      <Show when={log.data?.totals}>
        {(t) => (
          <div class="hr-kpis mb-4">
            <a class="hr-kpi" href="#log">
              <div class="v">{t().hours_worked_sum}</div>
              <div class="l">Hours</div>
            </a>
            <a class="hr-kpi" href="#log">
              <div class="v">{t().ot_hours_sum}</div>
              <div class="l">OT</div>
            </a>
            <a class="hr-kpi" href="#log">
              <div class="v">{t().night_diff_hours_sum}</div>
              <div class="l">Night diff</div>
            </a>
            <a class="hr-kpi warn" href="#log">
              <div class="v">{t().absent_days}</div>
              <div class="l">Absent / AWOL</div>
            </a>
          </div>
        )}
      </Show>

      <section id="log" class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Status</th>
                <th>Actual In</th>
                <th>Actual Out</th>
                <th class="num">Hours</th>
                <th class="num">OT</th>
                <th class="num">Night</th>
                <th>Holiday</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={(log.data?.lines ?? []).length > 0}
                fallback={
                  <tr>
                    <td colSpan={10} class="text-text-secondary">
                      {log.isFetching ? "Loading…" : log.isError ? "Could not load DTR log." : "No DTR rows this month."}
                    </td>
                  </tr>
                }
              >
                <For each={log.data?.lines ?? []}>
                  {(line) => (
                    <tr>
                      <td class="tabular-nums">{line.work_date.slice(0, 10)}</td>
                      <td>{line.weekday || "—"}</td>
                      <td>
                        <HrBadge tone={statusTone(line.status)}>{line.status}</HrBadge>
                      </td>
                      <td class="tabular-nums">{line.actual_in || "—"}</td>
                      <td class="tabular-nums">{line.actual_out || "—"}</td>
                      <td class="num">{line.hours_worked}</td>
                      <td class="num">{line.ot_hours}</td>
                      <td class="num">{line.night_diff_hours}</td>
                      <td>{line.holiday_name || "—"}</td>
                      <td>{line.absence_reason || "—"}</td>
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
