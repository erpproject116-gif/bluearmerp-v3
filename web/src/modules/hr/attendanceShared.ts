export type Holiday = {
  id: number;
  holiday_date: string;
  name: string;
  holiday_type: string;
  pay_multiplier: number;
};

export type Cutoff = {
  id: number;
  label: string;
  cutoff_start: string;
  cutoff_end: string;
  pay_date?: string | null;
  status: string;
};

export type DTR = {
  id: number;
  employee_id: number;
  employee_no?: string;
  employee_name?: string;
  work_date: string;
  status: string;
  hours_worked: number;
  ot_hours: number;
  night_diff_hours: number;
  holiday_name?: string;
  holiday_type?: string;
  absence_reason?: string;
  absence_remarks?: string;
};

export type MonthDayCell = { day: number; status: string; hours_worked?: number };

export type MonthOverviewRow = {
  employee_id: number;
  employee_no: string;
  employee_name: string;
  department: string;
  job_title: string;
  present_days: number;
  absent_days: number;
  awol_days: number;
  leave_days: number;
  holiday_days: number;
  rest_days: number;
  short_days: number;
  ot_hours_sum: number;
  night_diff_hours_sum: number;
  hours_worked_sum: number;
  days: MonthDayCell[];
};

export type EmployeeMonthLine = {
  id: number;
  work_date: string;
  weekday: string;
  status: string;
  hours_worked: number;
  ot_hours: number;
  night_diff_hours: number;
  actual_in?: string;
  actual_out?: string;
  holiday_name?: string;
  absence_reason?: string;
};

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(ym: string): { year: number; month: number; from: string; to: string; daysInMonth: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!(month >= 1 && month <= 12)) return null;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { year, month, from, to, daysInMonth: last };
}

export function dtrStatusLetter(status: string): string {
  switch (status) {
    case "present":
      return "P";
    case "absent":
      return "A";
    case "awol":
      return "W";
    case "leave":
      return "L";
    case "holiday":
      return "H";
    case "rest":
      return "R";
    default:
      return "";
  }
}

export type DtrMatrixTone = "ok" | "chk" | "bad" | "neu";

/** Option E matrix glyph + tone (ok / chk / bad / neu). */
export function dtrMatrixCell(status: string, hoursWorked = 0): { tone: DtrMatrixTone; icon: string; tag?: string } {
  if (status === "absent" || status === "awol") return { tone: "bad", icon: "✖", tag: "A" };
  if (status === "leave") return { tone: "neu", icon: "🌴", tag: "LV" };
  if (status === "holiday") return { tone: "neu", icon: "★", tag: "H" };
  if (status === "rest") return { tone: "neu", icon: "·", tag: "R" };
  if (status === "present") {
    if (hoursWorked > 0 && hoursWorked < 8) return { tone: "chk", icon: "⏰", tag: "L" };
    if (hoursWorked > 8) return { tone: "chk", icon: "＋", tag: "OT" };
    return { tone: "ok", icon: "✓" };
  }
  return { tone: "neu", icon: "·" };
}

export function dtrNeedsLook(status: string, hoursWorked = 0): boolean {
  const t = dtrMatrixCell(status, hoursWorked).tone;
  return t === "chk" || t === "bad";
}

export function shiftYearMonth(ym: string, delta: number): string {
  const b = monthBounds(ym);
  if (!b) return ym;
  const d = new Date(Date.UTC(b.year, b.month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Quincena half: 1–15 or 16–end. */
export type QuincenaHalf = "1" | "2";

export function currentQuincenaHalf(): QuincenaHalf {
  return new Date().getDate() <= 15 ? "1" : "2";
}

export function quincenaDays(ym: string, half: QuincenaHalf): number[] {
  const b = monthBounds(ym);
  if (!b) return [];
  if (half === "1") return Array.from({ length: Math.min(15, b.daysInMonth) }, (_, i) => i + 1);
  if (b.daysInMonth <= 15) return [];
  return Array.from({ length: b.daysInMonth - 15 }, (_, i) => i + 16);
}

export function quincenaLabel(ym: string, half: QuincenaHalf): string {
  const b = monthBounds(ym);
  if (!b) return ym;
  const name = new Date(Date.UTC(b.year, b.month - 1, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" });
  if (half === "1") return `1–15 ${name} ${b.year}`;
  return `16–${b.daysInMonth} ${name} ${b.year}`;
}

export function monthRangeLabel(ym: string): string {
  const b = monthBounds(ym);
  if (!b) return ym;
  const name = new Date(Date.UTC(b.year, b.month - 1, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" });
  return `1–${b.daysInMonth} ${name} ${b.year}`;
}

export function shiftQuincena(ym: string, half: QuincenaHalf, delta: number): { ym: string; half: QuincenaHalf } {
  if (delta === 0) return { ym, half };
  if (delta > 0) {
    if (half === "1") return { ym, half: "2" };
    return { ym: shiftYearMonth(ym, 1), half: "1" };
  }
  if (half === "2") return { ym, half: "1" };
  return { ym: shiftYearMonth(ym, -1), half: "2" };
}

export function isFutureQuincena(ym: string, half: QuincenaHalf): boolean {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const cd = now.getDate();
  const b = monthBounds(ym);
  if (!b) return false;
  if (b.year > cy || (b.year === cy && b.month > cm)) return true;
  if (b.year === cy && b.month === cm && half === "2" && cd < 16) return true;
  return false;
}

export function weekdayShort(year: number, month: number, day: number): string {
  return ["Su", "M", "T", "W", "Th", "F", "Sa"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

export function isWeekendDay(year: number, month: number, day: number): boolean {
  const w = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return w === 0 || w === 6;
}

/** Duty cell colors: green full day (≥8h), orange half-day, red absent/AWOL. */
export function dtrDutyCellClass(status: string, hoursWorked = 0): string {
  if (status === "absent" || status === "awol") {
    return "bg-red-500 text-white";
  }
  if (status === "present") {
    if (hoursWorked >= 8) return "bg-emerald-500 text-white";
    return "bg-orange-400 text-white";
  }
  switch (status) {
    case "leave":
      return "bg-sky-100 text-sky-900";
    case "holiday":
      return "bg-violet-100 text-violet-900";
    case "rest":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-transparent text-text-secondary";
  }
}

export function dtrStatusCellClass(status: string, hoursWorked = 0): string {
  return dtrDutyCellClass(status, hoursWorked);
}
