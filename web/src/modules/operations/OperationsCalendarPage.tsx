import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import {
  createWorkItem,
  patchWorkItem,
  useInvalidateWorkItems,
  useOperationsBoardWorkItems,
  useOperationsColumns,
  type WorkItem,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";

type CalView = "month" | "week" | "day";

const HOUR_H = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthMatrix(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const weeks: Date[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function itemOnDate(item: WorkItem, iso: string): boolean {
  const start = item.start_date ?? item.end_date;
  const end = item.end_date ?? item.start_date;
  if (!start) return false;
  const s = start.slice(0, 10);
  const e = (end ?? start).slice(0, 10);
  return s <= iso && iso <= e;
}

function parseHourFraction(t?: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h)) return null;
  return h + (Number.isNaN(m) ? 0 : m) / 60;
}

function formatHourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hourToTime(h: number): string {
  return `${pad2(h)}:00`;
}

function isTimedItem(item: WorkItem): boolean {
  return !item.all_day && !!item.start_time;
}

function eventLayout(item: WorkItem): { top: number; height: number; label: string } {
  const start = parseHourFraction(item.start_time) ?? 0;
  let end = parseHourFraction(item.end_time);
  if (end == null || end <= start) end = Math.min(start + 1, 24);
  const top = start * HOUR_H;
  const height = Math.max((end - start) * HOUR_H, HOUR_H * 0.5);
  const label = item.end_time
    ? `${item.start_time} – ${item.end_time}`
    : (item.start_time ?? "");
  return { top, height, label };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function OperationsCalendarPage() {
  const auth = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateWorkItems();
  const { workspaceId } = useOperationsWorkspace();
  const canCreate = () => hasPermission(auth.me, "operations.work_items_new", "write");
  const canEdit = () => hasPermission(auth.me, "operations.work_items", "write");

  const [view, setView] = createSignal<CalView>("month");
  const [cursor, setCursor] = createSignal(new Date());
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<WorkItem | null>(null);
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [startDate, setStartDate] = createSignal(toISODate(new Date()));
  const [endDate, setEndDate] = createSignal(toISODate(new Date()));
  const [startTime, setStartTime] = createSignal("");
  const [endTime, setEndTime] = createSignal("");
  const [allDay, setAllDay] = createSignal(true);
  const [columnId, setColumnId] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [remindOpt, setRemindOpt] = createSignal("none");
  const [nowFraction, setNowFraction] = createSignal(0);
  let dayScrollEl: HTMLDivElement | undefined;

  const items = useOperationsBoardWorkItems(workspaceId);
  const columns = useOperationsColumns(workspaceId);

  const todayISO = () => toISODate(new Date());

  createEffect(() => {
    const tick = () => {
      const n = new Date();
      setNowFraction(n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    onCleanup(() => clearInterval(id));
  });

  createEffect(() => {
    if (view() !== "day") return;
    const iso = toISODate(cursor());
    queueMicrotask(() => {
      if (!dayScrollEl) return;
      const targetHour = iso === todayISO() ? Math.max(0, new Date().getHours() - 1) : 8;
      dayScrollEl.scrollTop = targetHour * HOUR_H;
    });
  });

  const headerLabel = createMemo(() => {
    const d = cursor();
    if (view() === "month") {
      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    if (view() === "day") {
      return d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    const start = startOfWeek(d);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  });

  const weeks = createMemo(() => monthMatrix(cursor()));
  const weekDays = createMemo(() => {
    const start = startOfWeek(cursor());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  });

  const rows = () => items.data?.rows ?? [];
  const itemsFor = (iso: string) => rows().filter((r) => itemOnDate(r, iso));

  const dayISO = createMemo(() => toISODate(cursor()));
  const dayItems = createMemo(() => itemsFor(dayISO()));
  const dayAllDay = createMemo(() => dayItems().filter((i) => !isTimedItem(i)));
  const dayTimed = createMemo(() => dayItems().filter((i) => isTimedItem(i)));

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor());
    if (view() === "month") d.setMonth(d.getMonth() + dir);
    else if (view() === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const goToday = () => {
    setCursor(new Date());
    setView("day");
  };

  const openCreate = (iso: string, opts?: { hour?: number; allDay?: boolean }) => {
    if (!canCreate()) {
      toast.warning("You do not have permission to create work items.");
      return;
    }
    setEditing(null);
    setTitle("");
    setDescription("");
    setStartDate(iso);
    setEndDate(iso);
    const timed = opts?.hour != null && opts.allDay !== true;
    setAllDay(!timed);
    if (timed && opts?.hour != null) {
      setStartTime(hourToTime(opts.hour));
      setEndTime(hourToTime(Math.min(opts.hour + 1, 23)));
    } else {
      setStartTime("");
      setEndTime("");
    }
    setColumnId(columns.data?.[0]?.id ?? null);
    setRemindOpt("none");
    setModalOpen(true);
  };

  const openEdit = (item: WorkItem) => {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setStartDate(item.start_date ?? item.end_date ?? todayISO());
    setEndDate(item.end_date ?? item.start_date ?? todayISO());
    setStartTime(item.start_time ?? "");
    setEndTime(item.end_time ?? "");
    setAllDay(!isTimedItem(item));
    setColumnId(item.column_id);
    setRemindOpt("none");
    setModalOpen(true);
  };

  const save = async () => {
    const wsId = workspaceId();
    const colId = columnId();
    if (!wsId || !colId || !title().trim()) {
      toast.warning("Title and column are required.");
      return;
    }
    if (endDate() && startDate() && endDate() < startDate()) {
      toast.warning("End date cannot be before start date.");
      return;
    }
    if (!allDay() && startTime() && endTime() && endTime() <= startTime()) {
      toast.warning("End time must be after start time.");
      return;
    }
    setSaving(true);
    const ed = editing();
    const timed = !allDay() && !!startTime();
    const body = {
      title: title().trim(),
      description: description().trim() || undefined,
      column_id: colId,
      start_date: startDate() || undefined,
      end_date: endDate() || undefined,
      start_time: timed ? startTime() : "",
      end_time: timed && endTime() ? endTime() : "",
      all_day: !timed,
    };
    const res = ed
      ? await patchWorkItem(ed.id, body)
      : await createWorkItem({ workspace_id: wsId, ...body });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save task.");
      return;
    }
    if (remindOpt() !== "none") {
      toast.success(
        ed
          ? "Task updated. Reminder preference saved for a future notification release."
          : "Task created. Reminder preference noted for a future notification release.",
      );
    } else {
      toast.success(ed ? "Task updated." : "Task created.");
    }
    setModalOpen(false);
    invalidate();
  };

  const DayCell = (props: { date: Date; compact?: boolean }) => {
    const iso = toISODate(props.date);
    const inMonth = props.date.getMonth() === cursor().getMonth();
    const isToday = iso === todayISO();
    const dayItemsList = () => itemsFor(iso);
    return (
      <div
        class={`min-h-[5.5rem] border border-stroke/70 p-1.5 ${inMonth || view() === "week" ? "bg-white" : "bg-slate-50/80"} ${
          isToday ? "ring-2 ring-inset ring-brand-500" : ""
        }`}
      >
        <div class="mb-1 flex items-center justify-between gap-1">
          <button
            type="button"
            class={`rounded px-1 text-xs font-semibold hover:bg-brand-50 ${isToday ? "text-brand-700" : "text-text-secondary"}`}
            title="Open day view"
            onClick={() => {
              setCursor(new Date(props.date));
              setView("day");
            }}
          >
            {props.date.getDate()}
          </button>
          <Show when={canCreate()}>
            <button
              type="button"
              class="rounded px-1 text-xs text-brand-600 hover:bg-brand-50"
              title="Add task"
              onClick={() => openCreate(iso)}
            >
              +
            </button>
          </Show>
        </div>
        <div class={`space-y-0.5 ${props.compact ? "max-h-28 overflow-y-auto" : "max-h-24 overflow-y-auto"}`}>
          <For each={dayItemsList()}>
            {(item) => (
              <button
                type="button"
                class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:opacity-90"
                style={{ "background-color": "#2563eb" }}
                title={item.title}
                onClick={() => openEdit(item)}
              >
                <Show when={item.start_time && !item.all_day}>
                  <span class="opacity-90">{item.start_time} </span>
                </Show>
                {item.title}
              </button>
            )}
          </For>
        </div>
      </div>
    );
  };

  const viewBtn = (v: CalView, label: string) => (
    <button
      type="button"
      class={`rounded-md px-3 py-1.5 text-sm ${view() === v ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-slate-50"}`}
      onClick={() => setView(v)}
    >
      {label}
    </button>
  );

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <OperationsWorkspaceSelector />
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-lg border border-stroke bg-white p-0.5">
            {viewBtn("month", "Month")}
            {viewBtn("week", "Week")}
            {viewBtn("day", "Day")}
          </div>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => shift(-1)}>
            ‹
          </button>
          <button
            type="button"
            class={`rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50 ${
              view() === "day" && dayISO() === todayISO()
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-stroke"
            }`}
            onClick={goToday}
          >
            Today
          </button>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => shift(1)}>
            ›
          </button>
          <span class="min-w-[12rem] text-sm font-semibold text-text-primary">{headerLabel()}</span>
          <Show when={canCreate() && workspaceId()}>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => openCreate(toISODate(cursor()), view() === "day" ? { hour: new Date().getHours() } : { allDay: true })}
            >
              + Task
            </button>
          </Show>
        </div>
      </div>

      <Show when={workspaceId()} fallback={
        <p class="text-sm text-text-secondary">Select a workspace to view the calendar.</p>
      }>
        <Show when={items.isError}>
          <p class="mb-3 text-sm text-red-600">
            {(items.error as Error)?.message ?? "Failed to load work items."}
          </p>
        </Show>

        <div class="overflow-hidden rounded-xl border border-stroke bg-white shadow-sm">
          <Show when={view() !== "day"}>
            <div class="grid grid-cols-7 border-b border-stroke bg-slate-50">
              <For each={WEEKDAYS}>
                {(d) => (
                  <div class="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {d}
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={view() === "month"}>
            <For each={weeks()}>
              {(week) => (
                <div class="grid grid-cols-7">
                  <For each={week}>{(day) => <DayCell date={day} />}</For>
                </div>
              )}
            </For>
          </Show>

          <Show when={view() === "week"}>
            <div class="grid grid-cols-7">
              <For each={weekDays()}>{(day) => <DayCell date={day} compact />}</For>
            </div>
          </Show>

          <Show when={view() === "day"}>
            <div class="border-b border-stroke bg-slate-50 px-3 py-2">
              <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">All day</div>
              <div class="flex min-h-[2rem] flex-wrap gap-1">
                <Show when={dayAllDay().length === 0}>
                  <button
                    type="button"
                    class="rounded border border-dashed border-stroke px-2 py-1 text-xs text-text-secondary hover:bg-white"
                    onClick={() => openCreate(dayISO(), { allDay: true })}
                  >
                    + All-day task
                  </button>
                </Show>
                <For each={dayAllDay()}>
                  {(item) => (
                    <button
                      type="button"
                      class="rounded px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                      style={{ "background-color": "#2563eb" }}
                      onClick={() => openEdit(item)}
                    >
                      {item.title}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div
              ref={(el) => {
                dayScrollEl = el;
              }}
              class="relative max-h-[min(70vh,720px)] overflow-y-auto"
            >
              <div class="relative" style={{ height: `${24 * HOUR_H}px` }}>
                <For each={HOURS}>
                  {(h) => (
                    <div
                      class="absolute left-0 right-0 flex border-t border-stroke/60"
                      style={{ top: `${h * HOUR_H}px`, height: `${HOUR_H}px` }}
                    >
                      <div class="w-16 shrink-0 pr-2 pt-0.5 text-right text-[11px] text-text-secondary">
                        {formatHourLabel(h)}
                      </div>
                      <button
                        type="button"
                        class="min-h-full flex-1 hover:bg-brand-50/40"
                        title={canCreate() ? `Add task at ${formatHourLabel(h)}` : undefined}
                        onClick={() => openCreate(dayISO(), { hour: h })}
                      />
                    </div>
                  )}
                </For>

                <div class="pointer-events-none absolute bottom-0 left-16 right-0 top-0">
                  <For each={dayTimed()}>
                    {(item) => {
                      const layout = () => eventLayout(item);
                      return (
                        <button
                          type="button"
                          class="pointer-events-auto absolute left-1 right-2 overflow-hidden rounded-md border border-blue-700/30 bg-blue-600 px-2 py-1 text-left text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                          style={{
                            top: `${layout().top}px`,
                            height: `${layout().height}px`,
                          }}
                          title={`${layout().label} ${item.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(item);
                          }}
                        >
                          <div class="truncate">{item.title}</div>
                          <div class="truncate text-[10px] opacity-90">{layout().label}</div>
                        </button>
                      );
                    }}
                  </For>

                  <Show when={dayISO() === todayISO()}>
                    <div
                      class="absolute left-0 right-0 z-10 flex items-center"
                      style={{ top: `${nowFraction() * HOUR_H}px` }}
                    >
                      <div class="h-2.5 w-2.5 -ml-1 rounded-full bg-red-500" />
                      <div class="h-0.5 flex-1 bg-red-500" />
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </Show>
        </div>

        <Show when={!items.isFetching && rows().filter((r) => r.start_date || r.end_date).length === 0}>
          <p class="mt-4 text-sm text-text-secondary">
            No dated tasks yet. Click a day or hour (or + Task) to schedule one — it also appears on the Kanban board.
          </p>
        </Show>
      </Show>

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit task" : "New calendar task"}
        onClose={() => setModalOpen(false)}
        onSave={() => (editing() ? (canEdit() ? void save() : setModalOpen(false)) : void save())}
        saving={saving()}
      >
        <Field label="Title">
          <input
            class={inputClass}
            value={title()}
            disabled={!!editing() && !canEdit()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            class={inputClass}
            rows={3}
            value={description()}
            disabled={!!editing() && !canEdit()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
        <Field label="Column">
          <select
            class={inputClass}
            value={columnId() ?? ""}
            disabled={!!editing() && !canEdit()}
            onChange={(e) => setColumnId(Number(e.currentTarget.value) || null)}
          >
            <For each={columns.data ?? []}>
              {(col) => <option value={col.id}>{col.column_name}</option>}
            </For>
          </select>
        </Field>
        <Field label="Start date">
          <input
            type="date"
            class={inputClass}
            value={startDate()}
            disabled={!!editing() && !canEdit()}
            onInput={(e) => setStartDate(e.currentTarget.value)}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            class={inputClass}
            value={endDate()}
            disabled={!!editing() && !canEdit()}
            onInput={(e) => setEndDate(e.currentTarget.value)}
          />
        </Field>
        <label class="mb-3 flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={allDay()}
            disabled={!!editing() && !canEdit()}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setAllDay(checked);
              if (checked) {
                setStartTime("");
                setEndTime("");
              } else if (!startTime()) {
                const h = new Date().getHours();
                setStartTime(hourToTime(h));
                setEndTime(hourToTime(Math.min(h + 1, 23)));
              }
            }}
          />
          All day
        </label>
        <Show when={!allDay()}>
          <div class="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <input
                type="time"
                class={inputClass}
                value={startTime()}
                disabled={!!editing() && !canEdit()}
                onInput={(e) => setStartTime(e.currentTarget.value)}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                class={inputClass}
                value={endTime()}
                disabled={!!editing() && !canEdit()}
                onInput={(e) => setEndTime(e.currentTarget.value)}
              />
            </Field>
          </div>
        </Show>
        <Field label="Reminder (coming soon)">
          <select
            class={inputClass}
            value={remindOpt()}
            disabled={!!editing() && !canEdit()}
            onChange={(e) => setRemindOpt(e.currentTarget.value)}
          >
            <option value="none">None</option>
            <option value="10m">10 minutes before</option>
            <option value="30m">30 minutes before</option>
            <option value="1h">1 hour before</option>
            <option value="1d">1 day before</option>
          </select>
        </Field>
      </EntityModal>
    </OperationsLayout>
  );
}
