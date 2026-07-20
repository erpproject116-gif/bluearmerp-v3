import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import {
  addDays,
  CalView,
  eventOnDate,
  formatHourLabel,
  HOUR_H,
  HOURS,
  layoutTimed,
  monthMatrix,
  startOfWeek,
  TimedEventLike,
  toISODate,
  WEEKDAYS,
} from "../../shared/calendar/dateUtils";

type Booking = TimedEventLike & {
  booking_no: string;
  resource_name?: string;
  status: string;
};

export default function BookingCalendarPage() {
  const [view, setView] = createSignal<CalView>("week");
  const [cursor, setCursor] = createSignal(new Date());

  const range = createMemo(() => {
    const c = cursor();
    if (view() === "day") {
      const iso = toISODate(c);
      return { from: iso, to: iso };
    }
    if (view() === "week") {
      const start = startOfWeek(c);
      return { from: toISODate(start), to: toISODate(addDays(start, 6)) };
    }
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  });

  const list = createQuery(() => ({
    queryKey: ["booking-calendar", range().from, range().to],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: "1",
        pageSize: "200",
        sort: "starts_at",
        order: "asc",
        date_from: range().from,
        date_to: range().to,
      });
      const res = await apiFetch<Booking[]>(`/api/v1/booking/bookings?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load bookings");
      return res.data ?? [];
    },
  }));

  const title = createMemo(() => {
    const c = cursor();
    if (view() === "day") {
      return c.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    if (view() === "week") {
      const s = startOfWeek(c);
      return `${toISODate(s)} → ${toISODate(addDays(s, 6))}`;
    }
    return c.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  });

  const shift = (dir: number) => {
    const c = new Date(cursor());
    if (view() === "day") c.setDate(c.getDate() + dir);
    else if (view() === "week") c.setDate(c.getDate() + dir * 7);
    else c.setMonth(c.getMonth() + dir);
    setCursor(c);
  };

  const columns = createMemo(() => (view() === "day" ? [cursor()] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor()), i)));

  return (
    <div class="mx-auto max-w-7xl p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Booking calendar</h1>
          <p class="text-sm text-text-secondary">{title()}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <A href="/app/booking/bookings" class="text-sm text-brand-700 hover:underline">
            List view
          </A>
          <button type="button" class="rounded border border-stroke px-2 py-1 text-sm" onClick={() => shift(-1)}>
            Prev
          </button>
          <button type="button" class="rounded border border-stroke px-2 py-1 text-sm" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <button type="button" class="rounded border border-stroke px-2 py-1 text-sm" onClick={() => shift(1)}>
            Next
          </button>
          <For each={(["month", "week", "day"] as CalView[])}>
            {(v) => (
              <button
                type="button"
                class={`rounded px-2 py-1 text-sm ${view() === v ? "bg-brand-600 text-white" : "border border-stroke"}`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={view() === "month"}>
        <div class="overflow-hidden rounded-xl border border-stroke bg-white">
          <div class="grid grid-cols-7 border-b border-stroke bg-slate-50 text-center text-xs font-medium text-text-secondary">
            <For each={WEEKDAYS}>{(d) => <div class="py-2">{d}</div>}</For>
          </div>
          <For each={monthMatrix(cursor())}>
            {(week) => (
              <div class="grid grid-cols-7 border-b border-stroke last:border-0">
                <For each={week}>
                  {(day) => {
                    const iso = toISODate(day);
                    const inMonth = day.getMonth() === cursor().getMonth();
                    const events = () => (list.data ?? []).filter((e) => eventOnDate(e, iso) && e.status !== "cancelled");
                    return (
                      <div class={`min-h-[88px] border-r border-stroke p-1 last:border-0 ${inMonth ? "" : "bg-slate-50/60"}`}>
                        <div class="text-xs font-medium text-text-secondary">{day.getDate()}</div>
                        <For each={events().slice(0, 3)}>
                          {(ev) => (
                            <div class="mt-0.5 truncate rounded bg-brand-50 px-1 text-[10px] text-brand-800" title={ev.title}>
                              {ev.booking_no} {ev.title}
                            </div>
                          )}
                        </For>
                        <Show when={events().length > 3}>
                          <div class="text-[10px] text-text-secondary">+{events().length - 3} more</div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={view() !== "month"}>
        <div class="overflow-auto rounded-xl border border-stroke bg-white">
          <div
            class="grid min-w-[720px]"
            style={{ "grid-template-columns": `64px repeat(${columns().length}, minmax(0, 1fr))` }}
          >
            <div class="sticky top-0 z-20 border-b border-stroke bg-slate-50" />
            <For each={columns()}>
              {(day) => (
                <div class="sticky top-0 z-20 border-b border-l border-stroke bg-slate-50 px-1 py-2 text-center text-xs font-medium">
                  {WEEKDAYS[day.getDay()]} {day.getDate()}
                </div>
              )}
            </For>

            <div class="relative border-r border-stroke">
              <For each={HOURS}>
                {(h) => (
                  <div class="border-b border-stroke px-1 text-[10px] text-text-secondary" style={{ height: `${HOUR_H}px` }}>
                    {formatHourLabel(h)}
                  </div>
                )}
              </For>
            </div>

            <For each={columns()}>
              {(day) => {
                const iso = toISODate(day);
                const events = () => (list.data ?? []).filter((e) => eventOnDate(e, iso) && e.status !== "cancelled");
                return (
                  <div class="relative border-l border-stroke" style={{ height: `${24 * HOUR_H}px` }}>
                    <For each={HOURS}>
                      {() => <div class="border-b border-stroke" style={{ height: `${HOUR_H}px` }} />}
                    </For>
                    <For each={events()}>
                      {(ev) => {
                        const lay = layoutTimed(ev);
                        return (
                          <div
                            class="absolute left-0.5 right-0.5 z-10 overflow-hidden rounded bg-brand-100 px-1 py-0.5 text-[10px] text-brand-900 shadow-sm"
                            style={{ top: `${lay.top}px`, height: `${lay.height}px` }}
                            title={`${ev.booking_no} · ${ev.title} · ${ev.resource_name ?? ""}`}
                          >
                            <div class="truncate font-medium">{ev.title}</div>
                            <div class="truncate">{lay.label}</div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
