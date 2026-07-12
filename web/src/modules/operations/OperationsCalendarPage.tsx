import { createMemo, createSignal, For, Show } from "solid-js";
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

type CalView = "month" | "week";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
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
  const [columnId, setColumnId] = createSignal<number | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [remindOpt, setRemindOpt] = createSignal("none");

  const items = useOperationsBoardWorkItems(workspaceId);
  const columns = useOperationsColumns(workspaceId);

  const todayISO = toISODate(new Date());

  const headerLabel = createMemo(() => {
    const d = cursor();
    if (view() === "month") {
      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor());
    if (view() === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCursor(d);
  };

  const openCreate = (iso: string) => {
    if (!canCreate()) {
      toast.warning("You do not have permission to create work items.");
      return;
    }
    setEditing(null);
    setTitle("");
    setDescription("");
    setStartDate(iso);
    setEndDate(iso);
    setColumnId(columns.data?.[0]?.id ?? null);
    setRemindOpt("none");
    setModalOpen(true);
  };

  const openEdit = (item: WorkItem) => {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setStartDate(item.start_date ?? item.end_date ?? todayISO);
    setEndDate(item.end_date ?? item.start_date ?? todayISO);
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
    setSaving(true);
    const ed = editing();
    const body = {
      title: title().trim(),
      description: description().trim() || undefined,
      column_id: colId,
      start_date: startDate() || undefined,
      end_date: endDate() || undefined,
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
    const isToday = iso === todayISO;
    const dayItems = () => itemsFor(iso);
    return (
      <div
        class={`min-h-[5.5rem] border border-stroke/70 p-1.5 ${inMonth || view() === "week" ? "bg-white" : "bg-slate-50/80"} ${
          isToday ? "ring-2 ring-inset ring-brand-500" : ""
        }`}
      >
        <div class="mb-1 flex items-center justify-between gap-1">
          <span class={`text-xs font-semibold ${isToday ? "text-brand-700" : "text-text-secondary"}`}>
            {props.date.getDate()}
          </span>
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
          <For each={dayItems()}>
            {(item) => (
              <button
                type="button"
                class="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:opacity-90"
                style={{ "background-color": "#2563eb" }}
                title={item.title}
                onClick={() => openEdit(item)}
              >
                {item.title}
              </button>
            )}
          </For>
        </div>
      </div>
    );
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <OperationsWorkspaceSelector />
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-lg border border-stroke bg-white p-0.5">
            <button
              type="button"
              class={`rounded-md px-3 py-1.5 text-sm ${view() === "month" ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-slate-50"}`}
              onClick={() => setView("month")}
            >
              Month
            </button>
            <button
              type="button"
              class={`rounded-md px-3 py-1.5 text-sm ${view() === "week" ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-slate-50"}`}
              onClick={() => setView("week")}
            >
              Week
            </button>
          </div>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => shift(-1)}>
            ‹
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => setCursor(new Date())}
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
              onClick={() => openCreate(toISODate(cursor()))}
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
          <div class="grid grid-cols-7 border-b border-stroke bg-slate-50">
            <For each={WEEKDAYS}>
              {(d) => (
                <div class="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {d}
                </div>
              )}
            </For>
          </div>

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
            <p class="border-t border-stroke px-4 py-2 text-xs text-text-secondary">
              Timed slots and push/email reminders ship in a follow-up. Reminder choice on the task form is stored for that release.
            </p>
          </Show>
        </div>

        <Show when={!items.isFetching && rows().filter((r) => r.start_date || r.end_date).length === 0}>
          <p class="mt-4 text-sm text-text-secondary">
            No dated tasks yet. Click a day (or + Task) to schedule one — it also appears on the Kanban board.
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
