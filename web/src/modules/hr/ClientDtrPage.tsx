import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrEmpty, HrPageHead } from "./HrUi";
import {
  currentQuincenaHalf,
  currentYearMonth,
  dtrMatrixCell,
  dtrNeedsLook,
  isFutureQuincena,
  isWeekendDay,
  monthBounds,
  quincenaDays,
  quincenaLabel,
  shiftQuincena,
  weekdayShort,
  type MonthDayCell,
  type MonthOverviewRow,
  type QuincenaHalf,
} from "./attendanceShared";

type LookFilter = "all" | "look";
type ViewMode = "matrix" | "agenda";

function lookCount(row: MonthOverviewRow, days: number[]): number {
  const set = new Set(days);
  return (row.days ?? []).filter(
    (c) => set.has(c.day) && dtrNeedsLook(c.status, c.hours_worked ?? 0),
  ).length;
}

export default function ClientDtrPage() {
  const toast = useToast();
  const [ym, setYm] = createSignal(currentYearMonth());
  const [half, setHalf] = createSignal<QuincenaHalf>(currentQuincenaHalf());
  const [filter, setFilter] = createSignal<LookFilter>("all");
  const [clientFilter, setClientFilter] = createSignal("");
  const [q, setQ] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const [wrapEl, setWrapEl] = createSignal<HTMLDivElement | null>(null);
  const [view, setView] = createSignal<ViewMode>("matrix");

  const bounds = () => monthBounds(ym());
  const days = createMemo(() => quincenaDays(ym(), half()));
  const cutLabel = createMemo(() => quincenaLabel(ym(), half()));
  const nextDisabled = createMemo(() => {
    const n = shiftQuincena(ym(), half(), 1);
    return isFutureQuincena(n.ym, n.half);
  });

  const today = createMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  });

  const monthOverview = createQuery(() => {
    const b = bounds();
    return {
      queryKey: ["hr-dtr-month-overview", b?.year, b?.month],
      enabled: Boolean(b),
      queryFn: async () => {
        if (!b) return { rows: [] as MonthOverviewRow[] };
        const res = await apiFetch<{ rows: MonthOverviewRow[] }>(
          `/api/v1/hr/dtr/month-overview?year=${b.year}&month=${b.month}`,
          {},
          { silent: true },
        );
        if (!res.success)
          throw new Error(res.message ?? "Failed to load DTR matrix");
        return { rows: res.data?.rows ?? [] };
      },
    };
  });

  const clients = createMemo(() => {
    const set = new Set<string>();
    for (const r of monthOverview.data?.rows ?? []) {
      if (r.department) set.add(r.department);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const filteredRows = createMemo(() => {
    const qq = q().trim().toLowerCase();
    const cl = clientFilter();
    const lookOnly = filter() === "look";
    const dayList = days();
    return (monthOverview.data?.rows ?? []).filter((row) => {
      if (cl && row.department !== cl) return false;
      if (lookOnly && lookCount(row, dayList) === 0) return false;
      if (!qq) return true;
      return (
        row.employee_name.toLowerCase().includes(qq) ||
        row.employee_no.toLowerCase().includes(qq) ||
        (row.job_title || "").toLowerCase().includes(qq) ||
        (row.department || "").toLowerCase().includes(qq)
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
    const b = bounds();
    const t = today();
    return Boolean(b && b.year === t.y && b.month === t.m && d === t.d);
  };

  const rowHalfTotals = (row: MonthOverviewRow) => {
    const set = new Set(days());
    let present = 0;
    let hours = 0;
    for (const c of row.days ?? []) {
      if (!set.has(c.day)) continue;
      if (c.status === "present") {
        present += 1;
        hours += c.hours_worked ?? 0;
      }
    }
    return { present, hours };
  };

  const goCutoff = (delta: number) => {
    const next = shiftQuincena(ym(), half(), delta);
    if (delta > 0 && isFutureQuincena(next.ym, next.half)) return;
    setYm(next.ym);
    setHalf(next.half);
  };

  const scrollDays = (dir: number) => {
    const el = wrapEl();
    if (!el) return;
    el.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  const toggleGroup = (key: string) => {
    setCollapsed({ ...collapsed(), [key]: !collapsed()[key] });
  };

  const onDayClick = (row: MonthOverviewRow, day: number) => {
    toast.info(
      `Day edit · ${row.employee_name} · ${day} — opens employee DTR.`,
    );
  };

  const dueHint = createMemo(() => {
    const b = bounds();
    if (!b) return "";
    const name = new Date(Date.UTC(b.year, b.month - 1, 1)).toLocaleString(
      "en",
      { month: "short", timeZone: "UTC" },
    );
    if (half() === "1")
      return `Cut-off ${cutLabel()} · DTR due from clients on the 16th`;
    return `Cut-off ${cutLabel()} · DTR due from clients early ${name === "Dec" ? "Jan" : "next month"}`;
  });

  return (
    <HrLayout>
      <HrPageHead
        title="Client DTR"
        subtitle="Cut-off matrix by client / site. Click a day to edit · click a name for full detail."
      />

      <div
        id="mx"
        class="me-surface"
        data-open={view() === "agenda" ? "agenda" : ""}
      >
        <div class="me-bar">
          <div class="me-cut" role="group" aria-label="Cut-off">
            <button
              type="button"
              class="me-btn me-btn-secondary me-btn-sm"
              id="meprev"
              aria-label="Previous cut-off"
              onClick={() => goCutoff(-1)}
            >
              ‹
            </button>
            <b id="mecutl">{cutLabel()}</b>
            <button
              type="button"
              class="me-btn me-btn-secondary me-btn-sm"
              id="menext"
              aria-label="Next cut-off"
              disabled={nextDisabled()}
              onClick={() => goCutoff(1)}
            >
              ›
            </button>
          </div>
          <div class="me-seg" role="group" aria-label="Quick filter">
            <button
              type="button"
              data-fl="all"
              aria-pressed={filter() === "all"}
              classList={{ on: filter() === "all" }}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              data-fl="look"
              aria-pressed={filter() === "look"}
              classList={{ on: filter() === "look" }}
              onClick={() => setFilter("look")}
            >
              Needs a look
            </button>
          </div>
          <select
            class="me-input input"
            id="mecl"
            aria-label="Client"
            value={clientFilter()}
            onChange={(e) => setClientFilter(e.currentTarget.value)}
          >
            <option value="">All clients</option>
            <For each={clients()}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
          <input
            class="me-input input grow"
            id="meq"
            type="search"
            placeholder="Search name"
            aria-label="Search name"
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
          <span class="grow" />
          <button
            type="button"
            class="me-btn me-btn-ghost me-btn-sm"
            id="meview"
            aria-pressed={view() === "agenda"}
            onClick={() => setView(view() === "matrix" ? "agenda" : "matrix")}
          >
            {view() === "matrix" ? "☰ Agenda" : "▦ Matrix"}
          </button>
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
          <span>
            <i class="me-k wkk" />
            Weekend
          </span>
          <span>
            <i class="me-k tdk" />
            Today
          </span>
          <span class="muted">
            Click a day to edit · click a name for full detail
          </span>
        </div>

        <div class="me-tools">
          <button
            type="button"
            class="me-btn me-btn-ghost me-btn-sm"
            id="metog"
            onClick={() => {
              const keys = groups().map(([k]) => k);
              const allCollapsed =
                keys.length > 0 && keys.every((k) => collapsed()[k]);
              const next: Record<string, boolean> = {};
              for (const k of keys) next[k] = !allCollapsed;
              setCollapsed(next);
            }}
          >
            {groups().length > 0 && groups().every(([k]) => collapsed()[k])
              ? "Expand all"
              : "Collapse all"}
          </button>
          <span class="xs muted">{dueHint()}</span>
          <span class="grow" />
          <Show when={view() === "matrix"}>
            <button
              type="button"
              class="me-btn me-btn-secondary me-btn-sm"
              id="mesl"
              aria-label="Scroll days left"
              onClick={() => scrollDays(-1)}
            >
              ◀
            </button>
            <button
              type="button"
              class="me-btn me-btn-secondary me-btn-sm"
              id="mesr"
              aria-label="Scroll days right"
              onClick={() => scrollDays(1)}
            >
              ▶
            </button>
          </Show>
        </div>

        <Show when={view() === "agenda"}>
          <div class="me-agenda" aria-label={`Agenda ${cutLabel()}`}>
            <Show
              when={filteredRows().length > 0}
              fallback={
                <HrEmpty
                  title={
                    monthOverview.isFetching
                      ? "Loading…"
                      : "No people in this cut-off"
                  }
                  hint="Try another cut-off, clear filters, or switch back to Matrix."
                />
              }
            >
              <For each={groups()}>
                {([site, rows]) => (
                  <section class="me-agenda-group">
                    <h3>
                      {site}{" "}
                      <span class="xs muted">
                        {rows.length} people
                        <Show
                          when={
                            rows.filter((r) => lookCount(r, days()) > 0)
                              .length > 0
                          }
                        >
                          {" · "}
                          <span class="lk">
                            {
                              rows.filter((r) => lookCount(r, days()) > 0)
                                .length
                            }{" "}
                            need a look
                          </span>
                        </Show>
                      </span>
                    </h3>
                    <ul>
                      <For each={rows}>
                        {(row) => {
                          const looks = lookCount(row, days());
                          const halfTot = rowHalfTotals(row);
                          return (
                            <li>
                              <A
                                href={`/app/hr/attendance/employees/${row.employee_id}?month=${ym()}`}
                                class="mx-open"
                              >
                                {row.employee_name}
                              </A>
                              <Show when={looks > 0}>
                                <span class="xs lk">● {looks}</span>
                              </Show>
                              <span class="xs muted">
                                {row.job_title || row.employee_no} ·{" "}
                                {halfTot.present} days ·{" "}
                                {halfTot.hours.toFixed(1)}h
                              </span>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </Show>
          </div>
        </Show>

        <Show when={view() === "matrix"}>
          <div class="me-wrap" id="mewrap" tabindex="-1" ref={setWrapEl}>
            <Show
              when={filteredRows().length > 0}
              fallback={
                <HrEmpty
                  title={
                    monthOverview.isFetching
                      ? "Loading…"
                      : "No people in this cut-off"
                  }
                  hint="Try another cut-off, clear filters, or seed HR sample data."
                />
              }
            >
              <table
                class="me"
                role="grid"
                aria-label={`DTR matrix ${cutLabel()}`}
              >
                <thead>
                  <tr>
                    <th class="nm" scope="col">
                      Employee
                    </th>
                    <For each={days()}>
                      {(d) => {
                        const b = bounds();
                        const wk = b ? isWeekendDay(b.year, b.month, d) : false;
                        const td = isTodayCol(d);
                        return (
                          <th
                            scope="col"
                            data-d={String(d)}
                            class={`dh ${wk ? "wk" : ""} ${td ? "td" : ""}`}
                          >
                            <span class="dn">{d}</span>
                            <span class="dw">
                              {b ? weekdayShort(b.year, b.month, d) : ""}
                            </span>
                            <Show when={td}>
                              <span class="hl tdl">Today</span>
                            </Show>
                          </th>
                        );
                      }}
                    </For>
                    <th scope="col" class="tot t1" title="Days worked">
                      Days
                    </th>
                    <th scope="col" class="tot" title="Hours worked">
                      Hours
                    </th>
                    <th scope="col" class="tot" title="Overtime hours">
                      OT<small>h</small>
                    </th>
                    <th
                      scope="col"
                      class="tot"
                      title="Night differential hours"
                    >
                      ND<small>h</small>
                    </th>
                  </tr>
                </thead>
                <For each={groups()}>
                  {([site, rows]) => {
                    const dayList = days();
                    const needPeople = rows.filter(
                      (r) => lookCount(r, dayList) > 0,
                    ).length;
                    const sumDays = rows.reduce(
                      (n, r) => n + rowHalfTotals(r).present,
                      0,
                    );
                    const sumHrs = rows.reduce(
                      (n, r) => n + rowHalfTotals(r).hours,
                      0,
                    );
                    const sumOt = rows.reduce((n, r) => n + r.ot_hours_sum, 0);
                    const sumNd = rows.reduce(
                      (n, r) => n + r.night_diff_hours_sum,
                      0,
                    );
                    const open = !collapsed()[site];
                    return (
                      <tbody>
                        <tr class="grp">
                          <th class="nm" scope="rowgroup">
                            <button
                              type="button"
                              class="me-g"
                              aria-expanded={open}
                              onClick={() => toggleGroup(site)}
                            >
                              <span aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
                              {site}
                            </button>
                            <span class="xs text-text-secondary">
                              {rows.length} people
                              <Show when={needPeople > 0}>
                                {" · "}
                                <span class="lk">{needPeople} need a look</span>
                              </Show>
                            </span>
                          </th>
                          <td class="gsp" colSpan={dayList.length} />
                          <td class="tot t1">{sumDays}</td>
                          <td class="tot">{sumHrs.toFixed(1)}</td>
                          <td class="tot">{sumOt.toFixed(1)}</td>
                          <td class="tot">{sumNd.toFixed(1)}</td>
                        </tr>
                        <Show when={open}>
                          <For each={rows}>
                            {(row) => {
                              const byDay = cellByDay(row);
                              const looks = lookCount(row, dayList);
                              const halfTot = rowHalfTotals(row);
                              return (
                                <tr class="r">
                                  <th class="nm" scope="row">
                                    <A
                                      class="mx-open"
                                      href={`/app/hr/attendance/employees/${row.employee_id}?month=${ym()}`}
                                      title="Open full detail"
                                    >
                                      {row.employee_name}
                                    </A>{" "}
                                    <Show when={looks > 0}>
                                      <span class="xs lk" title="Needs a look">
                                        ● {looks}
                                      </span>
                                    </Show>
                                    <span class="xs text-text-secondary sub">
                                      {row.job_title || row.employee_no}
                                    </span>
                                  </th>
                                  <For each={dayList}>
                                    {(d) => {
                                      const cell = byDay.get(d);
                                      const status = cell?.status ?? "";
                                      const hours = cell?.hours_worked ?? 0;
                                      const m = dtrMatrixCell(status, hours);
                                      const b = bounds();
                                      const wk = b
                                        ? isWeekendDay(b.year, b.month, d)
                                        : false;
                                      const td = isTodayCol(d);
                                      return (
                                        <td
                                          class={`${wk ? "wk" : ""} ${td ? "td" : ""}`}
                                          data-d={String(d)}
                                        >
                                          <button
                                            type="button"
                                            class={`me-c ${m.tone}`}
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
                                  <td class="tot t1">{halfTot.present}</td>
                                  <td class="tot">
                                    {halfTot.hours.toFixed(1)}
                                  </td>
                                  <td class="tot">
                                    {row.ot_hours_sum.toFixed(1)}
                                  </td>
                                  <td class="tot">
                                    {row.night_diff_hours_sum.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            }}
                          </For>
                        </Show>
                      </tbody>
                    );
                  }}
                </For>
              </table>
            </Show>
          </div>
        </Show>
        <p class="xs muted" style={{ "margin-top": "10px" }}>
          Groups use department / site labels from employee records. Name opens
          the employee DTR log.
        </p>
      </div>
    </HrLayout>
  );
}
