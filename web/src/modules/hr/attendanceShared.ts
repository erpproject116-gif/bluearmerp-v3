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
