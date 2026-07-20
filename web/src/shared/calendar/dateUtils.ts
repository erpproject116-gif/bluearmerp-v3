/** Shared calendar date helpers (Booking + Operations). */

export type CalView = "month" | "week" | "day";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const HOUR_H = 56;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function monthMatrix(anchor: Date): Date[][] {
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

export function formatHourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type TimedEventLike = {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status?: string;
};

export function eventOnDate(ev: TimedEventLike, iso: string): boolean {
  const s = ev.starts_at.slice(0, 10);
  const e = ev.ends_at.slice(0, 10);
  return s <= iso && iso <= e;
}

export function layoutTimed(ev: TimedEventLike): { top: number; height: number; label: string } {
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const startH = start.getHours() + start.getMinutes() / 60;
  let endH = end.getHours() + end.getMinutes() / 60;
  if (endH <= startH) endH = Math.min(startH + 1, 24);
  const top = startH * HOUR_H;
  const height = Math.max((endH - startH) * HOUR_H, HOUR_H * 0.5);
  const label = `${pad2(start.getHours())}:${pad2(start.getMinutes())} – ${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  return { top, height, label };
}
