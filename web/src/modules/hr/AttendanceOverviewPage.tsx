import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";
import {
  currentQuincenaHalf,
  currentYearMonth,
  dtrMatrixCell,
  dtrNeedsLook,
  isFutureQuincena,
  isWeekendDay,
  monthBounds,
  monthRangeLabel,
  quincenaDays,
  quincenaLabel,
  shiftQuincena,
  shiftYearMonth,
  weekdayShort,
  type MonthDayCell,
  type MonthOverviewRow,
  type QuincenaHalf,
} from "./attendanceShared";

type Density = "S" | "M" | "L";
type LookFilter = "all" | "look";
type RangeMode = "quincena" | "month";

const densityPx: Record<
  Density,
  { day: number; padY: number; padX: number; row: number; font: number }
> = {
  S: { day: 28, padY: 2, padX: 2, row: 28, font: 11 },
  M: { day: 36, padY: 4, padX: 4, row: 36, font: 12 },
  L: { day: 48, padY: 8, padX: 6, row: 44, font: 13 },
};

function lookCount(row: MonthOverviewRow, days: number[]): number {
  const set = new Set(days);
  return (row.days ?? []).filter(
    (c) => set.has(c.day) && dtrNeedsLook(c.status, c.hours_worked ?? 0),
  ).length;
}

function rangeTotals(row: MonthOverviewRow, days: number[]) {
  const set = new Set(days);
  let present = 0;
  let hours = 0;
  let absent = 0;
  for (const c of row.days ?? []) {
    if (!set.has(c.day)) continue;
    if (c.status === "present") {
      present += 1;
      hours += c.hours_worked ?? 0;
    } else if (c.status === "absent" || c.status === "awol") {
      absent += 1;
    }
  }
  return { present, hours, absent };
}

export default function AttendanceOverviewPage() {
  const toast = useToast();
  const [overviewMonth, setOverviewMonth] = createSignal(currentYearMonth());
  const [half, setHalf] = createSignal<QuincenaHalf>(currentQuincenaHalf());
  const [rangeMode, setRangeMode] = createSignal<RangeMode>("quincena");
  const [density, setDensity] = createSignal<Density>("M");
  const [empColW, setEmpColW] = createSignal(200);
  const [filter, setFilter] = createSignal<LookFilter>("all");
  const [deptFilter, setDeptFilter] = createSignal("");
  const [q, setQ] = createSignal("");
  const overviewBounds = () => monthBounds(overviewMonth());
  const size = createMemo(() => densityPx[density()]);

  const today = createMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  });

  const monthOverview = createQuery(() => {
    const b = overviewBounds();
    return {
      queryKey: ["hr-dtr-month-overview", b?.year, b?.month],
      enabled: Boolean(b),
      queryFn: async () => {
        if (!b) return { rows: [] as MonthOverviewRow[], days_in_month: 0 };
        const res = await apiFetch<{
          rows: MonthOverviewRow[];
          days_in_month: number;
        }>(
          `/api/v1/hr/dtr/month-overview?year=${b.year}&month=${b.month}`,
          {},
          { silent: true },
        );
        if (!res.success)
          throw new Error(res.message ?? "Failed to load month overview");
        return {
          rows: res.data?.rows ?? [],
          days_in_month: res.data?.days_in_month ?? b.daysInMonth,
        };
      },
    };
  });

  const dayNums = createMemo(() => {
    if (rangeMode() === "month") {
      const n =
        monthOverview.data?.days_in_month ??
        overviewBounds()?.daysInMonth ??
        31;
      return Array.from({ length: n }, (_, i) => i + 1);
    }
    return quincenaDays(overviewMonth(), half());
  });

  const periodLabel = createMemo(() =>
    rangeMode() === "month"
      ? monthRangeLabel(overviewMonth())
      : quincenaLabel(overviewMonth(), half()),
  );

  const nextDisabled = createMemo(() => {
    if (rangeMode() === "month") {
      const next = shiftYearMonth(overviewMonth(), 1);
      const b = monthBounds(next);
      if (!b) return false;
      const t = today();
      return b.year > t.y || (b.year === t.y && b.month > t.m);
    }
    const n = shiftQuincena(overviewMonth(), half(), 1);
    return isFutureQuincena(n.ym, n.half);
  });

  const depts = createMemo(() => {
    const set = new Set<string>();
    for (const r of monthOverview.data?.rows ?? []) {
      if (r.department) set.add(r.department);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const filteredRows = createMemo(() => {
    const qq = q().trim().toLowerCase();
    const dept = deptFilter();
    const lookOnly = filter() === "look";
    const days = dayNums();
    return (monthOverview.data?.rows ?? []).filter((row) => {
      if (dept && row.department !== dept) return false;
      if (lookOnly && lookCount(row, days) === 0) return false;
      if (!qq) return true;
      return (
        row.employee_name.toLowerCase().includes(qq) ||
        row.employee_no.toLowerCase().includes(qq) ||
        (row.job_title || "").toLowerCase().includes(qq)
      );
    });
  });

  const groups = createMemo(() => {
    const map = new Map<string, MonthOverviewRow[]>();
    for (const row of filteredRows()) {
      const key = row.department || "Unassigned";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  const cellByDay = (row: MonthOverviewRow) => {
    const map = new Map<number, MonthDayCell>();
    for (const cell of row.days ?? []) map.set(cell.day, cell);
    return map;
  };

  const isTodayCol = (d: number) => {
    const b = overviewBounds();
    const t = today();
    return Boolean(b && b.year === t.y && b.month === t.m && d === t.d);
  };

  const tableMinW = () => empColW() + dayNums().length * size().day + 5 * 56;

  const goPrev = () => {
    if (rangeMode() === "month") {
      setOverviewMonth(shiftYearMonth(overviewMonth(), -1));
      return;
    }
    const prev = shiftQuincena(overviewMonth(), half(), -1);
    setOverviewMonth(prev.ym);
    setHalf(prev.half);
  };

  const goNext = () => {
    if (nextDisabled()) return;
    if (rangeMode() === "month") {
      setOverviewMonth(shiftYearMonth(overviewMonth(), 1));
      return;
    }
    const next = shiftQuincena(overviewMonth(), half(), 1);
    if (isFutureQuincena(next.ym, next.half)) return;
    setOverviewMonth(next.ym);
    setHalf(next.half);
  };

  const onDayClick = (row: MonthOverviewRow, day: number) => {
    toast.info(
      `Day edit for ${row.employee_name} · ${day} — opens employee DTR.`,
    );
  };

  return (
    <HrLayout>
      <HrPageHead
        title="Attendance overview"
        subtitle="Quincena matrix by default · switch to full month when you need the whole calendar."
      />

      <div class="me-bar">
        <div
          class="flex items-center gap-1"
          role="group"
          aria-label={rangeMode() === "month" ? "Month" : "Cut-off"}
        >
          <button
            type="button"
            class="hr-btn hr-btn-sm"
            aria-label="Previous"
            onClick={goPrev}
          >
            ‹
          </button>
          <b class="min-w-[10rem] text-center text-sm">{periodLabel()}</b>
          <button
            type="button"
            class="hr-btn hr-btn-sm"
            aria-label="Next"
            disabled={nextDisabled()}
            onClick={goNext}
          >
            ›
          </button>
        </div>
        <div class="hr-seg" role="group" aria-label="Range">
          <button
            type="button"
            classList={{ on: rangeMode() === "quincena" }}
            aria-pressed={rangeMode() === "quincena"}
            onClick={() => setRangeMode("quincena")}
          >
            Quincena
          </button>
          <button
            type="button"
            classList={{ on: rangeMode() === "month" }}
            aria-pressed={rangeMode() === "month"}
            onClick={() => setRangeMode("month")}
          >
            Month
          </button>
        </div>
        <div class="hr-seg" role="group" aria-label="Quick filter">
          <button
            type="button"
            classList={{ on: filter() === "all" }}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            classList={{ on: filter() === "look" }}
            onClick={() => setFilter("look")}
          >
            Needs a look
          </button>
        </div>
        <select
          class={inputClass}
          aria-label="Department"
          value={deptFilter()}
          onChange={(e) => setDeptFilter(e.currentTarget.value)}
        >
          <option value="">All departments</option>
          <For each={depts()}>{(d) => <option value={d}>{d}</option>}</For>
        </select>
        <input
          class={`${inputClass} grow`}
          type="search"
          placeholder="Search name"
          aria-label="Search name"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <div class="hr-seg" role="group" aria-label="Cell size">
          <For each={["S", "M", "L"] as Density[]}>
            {(d) => (
              <button
                type="button"
                classList={{ on: density() === d }}
                onClick={() => setDensity(d)}
              >
                {d}
              </button>
            )}
          </For>
        </div>
        <label class="flex items-center gap-2 text-xs text-text-secondary">
          Name col
          <input
            type="range"
            min="140"
            max="320"
            step="10"
            value={empColW()}
            onInput={(e) => setEmpColW(Number(e.currentTarget.value))}
          />
        </label>
      </div>

      <div class="me-legend" aria-label="Legend">
        <span>
          <i class="me-k ok">✓</i>Present
        </span>
        <span>
          <i class="me-k chk">
            ⏰<b>L</b>
          </i>
          Needs a look
        </span>
        <span>
          <i class="me-k bad">
            ✖<b>A</b>
          </i>
          Absent / missing punch
        </span>
        <span>
          <i class="me-k neu">
            🌴<b>LV</b>
          </i>
          Leave · <b>R</b> rest · <b>H</b> holiday
        </span>
        <span class="text-text-secondary">
          Click a day to edit · click a name for full detail
        </span>
      </div>

      <section class="rounded-xl border border-stroke bg-surface shadow-sm">
        <div
          class="max-h-[min(70vh,720px)] overflow-auto overscroll-contain"
          style={{ "scrollbar-gutter": "stable" }}
        >
          <table
            class="me border-separate border-spacing-0 text-left"
            role="grid"
            aria-label={`DTR matrix ${periodLabel()}`}
            style={{
              "min-width": `${tableMinW()}px`,
              "font-size": `${size().font}px`,
            }}
          >
            <thead>
              <tr class="border-b border-stroke text-xs font-semibold text-text-secondary">
                <th
                  class="sticky left-0 top-0 z-30 border-b border-r border-stroke bg-surface py-2 pr-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                  style={{
                    width: `${empColW()}px`,
                    "min-width": `${empColW()}px`,
                    "max-width": `${empColW()}px`,
                  }}
                  scope="col"
                >
                  Employee
                </th>
                <For each={dayNums()}>
                  {(d) => {
                    const b = overviewBounds();
                    const wk = b ? isWeekendDay(b.year, b.month, d) : false;
                    const td = isTodayCol(d);
                    return (
                      <th
                        class={`sticky top-0 z-20 border-b border-stroke bg-surface text-center tabular-nums ${wk ? "me-wk" : ""} ${td ? "me-td" : ""}`}
                        style={{
                          width: `${size().day}px`,
                          "min-width": `${size().day}px`,
                          padding: `${size().padY}px ${size().padX}px`,
                        }}
                        scope="col"
                      >
                        <span class="block leading-tight">{d}</span>
                        <span class="block text-[10px] font-normal opacity-70">
                          {b ? weekdayShort(b.year, b.month, d) : ""}
                        </span>
                        <Show when={td}>
                          <span class="block text-[9px] font-semibold text-brand-700">
                            Today
                          </span>
                        </Show>
                      </th>
                    );
                  }}
                </For>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-surface py-2 pl-2 pr-2 text-right"
                  title="Days present"
                >
                  Days
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-surface py-2 pr-2 text-right"
                  title="Hours worked"
                >
                  Hours
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-surface py-2 pr-2 text-right"
                  title={
                    rangeMode() === "quincena"
                      ? "OT hours (month total)"
                      : "OT hours"
                  }
                >
                  OT<small>h</small>
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-surface py-2 pr-2 text-right"
                  title={
                    rangeMode() === "quincena"
                      ? "Night differential (month total)"
                      : "Night differential"
                  }
                >
                  ND<small>h</small>
                </th>
                <th
                  class="sticky top-0 z-20 border-b border-stroke bg-surface py-2 text-right"
                  title="Absent + AWOL"
                >
                  Abs
                </th>
              </tr>
            </thead>
            <Show
              when={filteredRows().length > 0}
              fallback={
                <tbody>
                  <tr>
                    <td
                      colSpan={6 + dayNums().length}
                      class="px-3 py-4 text-text-secondary"
                    >
                      {monthOverview.isFetching
                        ? "Loading…"
                        : "No matching employees."}
                    </td>
                  </tr>
                </tbody>
              }
            >
              <For each={groups()}>
                {([dept, rows]) => {
                  const days = dayNums();
                  const need = rows.reduce(
                    (n, r) => n + (lookCount(r, days) > 0 ? 1 : 0),
                    0,
                  );
                  const sumDays = rows.reduce(
                    (n, r) => n + rangeTotals(r, days).present,
                    0,
                  );
                  const sumHrs = rows.reduce(
                    (n, r) => n + rangeTotals(r, days).hours,
                    0,
                  );
                  const sumOt = rows.reduce((n, r) => n + r.ot_hours_sum, 0);
                  const sumNd = rows.reduce(
                    (n, r) => n + r.night_diff_hours_sum,
                    0,
                  );
                  const sumAbs = rows.reduce(
                    (n, r) => n + rangeTotals(r, days).absent,
                    0,
                  );
                  return (
                    <tbody>
                      <tr class="bg-slate-50/90">
                        <th
                          class="sticky left-0 z-10 border-b border-r border-slate-100 bg-slate-50 py-2 pr-3 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                          style={{
                            width: `${empColW()}px`,
                            "min-width": `${empColW()}px`,
                            "max-width": `${empColW()}px`,
                          }}
                          scope="rowgroup"
                        >
                          <div class="truncate">{dept}</div>
                          <div class="text-xs font-normal text-text-secondary">
                            {rows.length} people
                            <Show when={need > 0}>
                              {" · "}
                              <span class="text-amber-700">
                                {need} need a look
                              </span>
                            </Show>
                          </div>
                        </th>
                        <td
                          class="border-b border-slate-100"
                          colSpan={days.length}
                        />
                        <td class="border-b border-slate-100 py-1 pl-2 pr-2 text-right tabular-nums">
                          {sumDays}
                        </td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                          {sumHrs.toFixed(1)}
                        </td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                          {sumOt.toFixed(1)}
                        </td>
                        <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                          {sumNd.toFixed(1)}
                        </td>
                        <td class="border-b border-slate-100 py-1 text-right tabular-nums">
                          {sumAbs}
                        </td>
                      </tr>
                      <For each={rows}>
                        {(row) => {
                          const byDay = cellByDay(row);
                          const looks = lookCount(row, days);
                          const tot = rangeTotals(row, days);
                          return (
                            <tr
                              class="hover:bg-slate-50/80"
                              style={{ height: `${size().row}px` }}
                            >
                              <th
                                class="sticky left-0 z-10 border-b border-r border-slate-100 bg-surface pr-3 text-left font-normal shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                                style={{
                                  width: `${empColW()}px`,
                                  "min-width": `${empColW()}px`,
                                  "max-width": `${empColW()}px`,
                                }}
                                scope="row"
                              >
                                <A
                                  href={`/app/hr/attendance/employees/${row.employee_id}?month=${overviewMonth()}`}
                                  class="block truncate font-medium text-brand-700 hover:underline"
                                  title="Open full detail"
                                >
                                  {row.employee_name}
                                </A>
                                <Show when={looks > 0}>
                                  <span
                                    class="mr-1 text-xs text-amber-700"
                                    title="Needs a look"
                                  >
                                    ● {looks}
                                  </span>
                                </Show>
                                <span class="block truncate text-xs text-text-secondary">
                                  {row.job_title || row.employee_no}
                                </span>
                              </th>
                              <For each={days}>
                                {(d) => {
                                  const cell = byDay.get(d);
                                  const status = cell?.status ?? "";
                                  const hours = cell?.hours_worked ?? 0;
                                  const m = dtrMatrixCell(status, hours);
                                  const b = overviewBounds();
                                  const wk = b
                                    ? isWeekendDay(b.year, b.month, d)
                                    : false;
                                  const td = isTodayCol(d);
                                  return (
                                    <td
                                      class={`border-b border-slate-100 p-0 text-center ${wk ? "me-wk" : ""} ${td ? "me-td" : ""}`}
                                      style={{
                                        width: `${size().day}px`,
                                        "min-width": `${size().day}px`,
                                        padding: `${size().padY}px ${size().padX}px`,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        class={`me-c ${m.tone}`}
                                        title={
                                          status
                                            ? `${status}${status === "present" ? ` · ${hours}h` : ""}`
                                            : undefined
                                        }
                                        aria-label={`${row.employee_name}, day ${d}: ${status || "empty"}`}
                                        onClick={() => onDayClick(row, d)}
                                      >
                                        <span aria-hidden="true">
                                          {m.icon}
                                          <Show when={m.tag}>
                                            <b>{m.tag}</b>
                                          </Show>
                                        </span>
                                      </button>
                                    </td>
                                  );
                                }}
                              </For>
                              <td class="border-b border-slate-100 py-1 pl-2 pr-2 text-right tabular-nums">
                                {tot.present}
                              </td>
                              <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                                {tot.hours.toFixed(1)}
                              </td>
                              <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                                {row.ot_hours_sum}
                              </td>
                              <td class="border-b border-slate-100 py-1 pr-2 text-right tabular-nums">
                                {row.night_diff_hours_sum}
                              </td>
                              <td class="border-b border-slate-100 py-1 text-right tabular-nums">
                                {tot.absent}
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                    </tbody>
                  );
                }}
              </For>
            </Show>
          </table>
        </div>
      </section>
    </HrLayout>
  );
}
