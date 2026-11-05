import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatAmount } from "../../shared/money";
import { useToast } from "../../shared/toast";
import { HrBadge, HrPageHead, HrPlanned, type HrBadgeTone } from "./HrUi";
import { HrLayout } from "./HrLayout";
import { useManpowerMode } from "./manpowerMode";

type Site = {
  site_name: string;
  industry_name?: string;
  people: { employee_name: string }[];
};
type Client = { id: number; name: string; sites: Site[] };
type Assignment = {
  id: number;
  employee_id: number;
  employee_name: string;
  client_name: string;
  site_name: string;
  start_date: string;
  end_date: string;
};
type Workforce = { unassigned?: { employee_id: number; employee_name: string }[] };
type Application = { id: number; status: string };
type Manpower = { id: number; client_name: string; site_name: string; headcount: number; details: string; status: string; created_at?: string };
type ClientTime = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; status: string };
type ClientBill = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; total: number };
type Doc = { id: number; employee_name: string; title: string; doc_type: string; expires_on: string; late: boolean };
type LeaveRow = { id: number; employee_name: string; leave_name: string; date_from: string; date_to: string; status: string };
type Holiday = { holiday_date: string; name: string; holiday_type: string };
type Cutoff = { label: string; cutoff_start: string; cutoff_end: string; pay_date?: string; status: string };
type PayPeriod = { id: number; period_label: string; period_start: string; period_end: string; status: string };

type Overview = {
  active_employees: number;
  open_discipline_cases: number;
  pending_leave: number;
  open_absence_alerts: number;
  applicants?: number;
  open_workplace_problems?: number;
  late_workplace_problems?: number;
  evaluations_due?: number;
  problems_closed_this_month?: number;
  leave_waiting?: number;
  loans_waiting?: number;
  pay_questions_waiting?: number;
  requests_waiting?: number;
};

const PIPELINE = [
  ["pooling", "Pooling"],
  ["initial_interview", "Initial interview"],
  ["exam", "Exam"],
  ["final_interview", "Final interview"],
  ["onboarding", "Onboarding"],
  ["hired", "Hired"],
] as const;

const INDUSTRY_COLORS = ["#2563EB", "#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];

const WIDGETS = [
  ["attn", "Needs your attention"],
  ["ev", "Upcoming events & deadlines"],
  ["dep", "Deployment by client"],
  ["ind", "Deployed by industry"],
  ["trend", "Headcount trend"],
  ["fun", "Applicant pipeline"],
  ["mr", "Open manpower requests"],
  ["att", "Attendance today"],
  ["dtr", "Client DTR status"],
  ["pay", "Payroll · current cut-off"],
  ["bill", "Receivables & billing"],
  ["cal", "Who's out · this week"],
  ["comp", "Compliance alerts"],
  ["feed", "Recent activity"],
] as const;

type QueueItem = {
  group: string;
  icon: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  badge: string;
  tone: HrBadgeTone;
};

const QUEUE_CHIPS: [string, string][] = [
  ["", "All"],
  ["case", "Cases & NTEs"],
  ["eval", "Evaluations"],
  ["ctr", "Contracts"],
  ["reg", "Regularization"],
  ["time", "DTR"],
  ["req", "Requests"],
  ["mr", "Manpower"],
  ["pay", "Payroll"],
  ["doc", "Documents"],
];

const PAY_STEPS = ["DTR locked", "Computing", "HR review", "Approved", "Paid"] as const;

const PREF_KEY = "hr-overview-widgets";

function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function manilaClock() {
  return `${new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })} (Asia/Manila)`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekBounds(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay();
  const monday = addDays(today, day === 0 ? -6 : 1 - day);
  return { start: monday, end: addDays(monday, 6) };
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function loadPrefs(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function loadList<T>(path: string): Promise<T[]> {
  const res = await apiFetch<T[]>(path, {}, { silent: true });
  return res.success && Array.isArray(res.data) ? res.data : [];
}

function payStepIndex(status: string) {
  const s = status.toLowerCase();
  if (s === "paid" || s === "posted") return 4;
  if (s === "approved") return 3;
  if (s === "review" || s === "hr_review" || s === "ready") return 2;
  if (s === "computing" || s === "processing" || s === "draft" || s === "open") return 1;
  if (s === "locked" || s === "dtr_locked") return 0;
  return 1;
}

function timeStatusTone(status: string): HrBadgeTone {
  if (status === "accepted") return "success";
  if (status === "returned") return "warning";
  if (status === "submitted") return "info";
  if (status === "overdue" || status === "rejected") return "danger";
  return "neutral";
}

function donutSlices(rows: { name: string; count: number }[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  const circ = 2 * Math.PI * 15.9;
  let offset = 25;
  return rows.map((row, i) => {
    const frac = row.count / total;
    const dash = circ * frac;
    const slice = {
      name: row.name,
      count: row.count,
      pct: Math.round(frac * 100),
      color: INDUSTRY_COLORS[i % INDUSTRY_COLORS.length],
      dasharray: `${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`,
      dashoffset: offset.toFixed(1),
    };
    offset -= dash;
    return slice;
  });
}

export default function HrOverviewPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const mode = useManpowerMode();
  const today = manilaToday();
  const week = weekBounds(today);
  const soon = addDays(today, 30);
  const [busy, setBusy] = createSignal(false);
  const [confirmRemove, setConfirmRemove] = createSignal(false);
  const [customize, setCustomize] = createSignal(false);
  const [queueFilter, setQueueFilter] = createSignal("");
  const [clientId, setClientId] = createSignal("");
  const [updated, setUpdated] = createSignal(manilaClock());
  const [prefs, setPrefs] = createSignal<Record<string, boolean>>(loadPrefs());

  const overview = createQuery(() => ({
    queryKey: ["hr-overview"],
    queryFn: async () => (await apiFetch<Overview>("/api/v1/hr/overview", {}, { silent: true })).data,
  }));
  const clients = createQuery(() => ({
    queryKey: ["hr-overview-clients"],
    enabled: mode.enabled(),
    queryFn: () => loadList<Client>("/api/v1/hr/clients"),
  }));
  const assignments = createQuery(() => ({
    queryKey: ["hr-overview-assignments"],
    enabled: mode.enabled(),
    queryFn: () => loadList<Assignment>("/api/v1/hr/assignments"),
  }));
  const workforce = createQuery(() => ({
    queryKey: ["hr-overview-workforce"],
    enabled: mode.enabled(),
    queryFn: async () => {
      const res = await apiFetch<Workforce>("/api/v1/hr/workforce", {}, { silent: true });
      return res.success ? res.data : { unassigned: [] };
    },
  }));
  const applications = createQuery(() => ({
    queryKey: ["hr-overview-applications"],
    queryFn: () => loadList<Application>("/api/v1/hr/applications"),
  }));
  const manpower = createQuery(() => ({
    queryKey: ["hr-overview-manpower"],
    enabled: mode.enabled(),
    queryFn: () => loadList<Manpower>("/api/v1/hr/manpower-requests"),
  }));
  const timeFiles = createQuery(() => ({
    queryKey: ["hr-overview-time"],
    enabled: mode.enabled(),
    queryFn: () => loadList<ClientTime>("/api/v1/hr/client-time"),
  }));
  const bills = createQuery(() => ({
    queryKey: ["hr-overview-bills"],
    enabled: mode.enabled(),
    queryFn: () => loadList<ClientBill>("/api/v1/hr/client-bills"),
  }));
  const documents = createQuery(() => ({
    queryKey: ["hr-overview-docs"],
    queryFn: () => loadList<Doc>("/api/v1/hr/compliance-documents"),
  }));
  const leaveRows = createQuery(() => ({
    queryKey: ["hr-overview-leave"],
    queryFn: () => loadList<LeaveRow>("/api/v1/hr/leave-requests?pageSize=100"),
  }));
  const holidays = createQuery(() => ({
    queryKey: ["hr-overview-holidays", today.slice(0, 4)],
    queryFn: () => loadList<Holiday>(`/api/v1/hr/holidays?year=${today.slice(0, 4)}`),
  }));
  const cutoffs = createQuery(() => ({
    queryKey: ["hr-overview-cutoffs"],
    queryFn: () => loadList<Cutoff>("/api/v1/hr/cutoffs"),
  }));
  const periods = createQuery(() => ({
    queryKey: ["hr-overview-periods"],
    queryFn: () => loadList<PayPeriod>("/api/v1/hr/pay-periods?pageSize=20"),
  }));

  const selectedClient = createMemo(() => (clients.data ?? []).find((row) => String(row.id) === clientId()));
  const openAssignments = createMemo(() =>
    (assignments.data ?? []).filter((row) => row.end_date === "" && (!selectedClient() || row.client_name === selectedClient()?.name)),
  );
  const deployed = createMemo(() => new Set(openAssignments().map((row) => row.employee_id)).size);
  const bench = createMemo(() => (workforce.data?.unassigned ?? []).length);
  const byClient = createMemo(() => {
    const counts = new Map<string, number>();
    for (const row of openAssignments()) counts.set(row.client_name, (counts.get(row.client_name) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  });
  const byIndustry = createMemo(() => {
    const counts = new Map<string, number>();
    for (const client of clients.data ?? []) {
      if (selectedClient() && client.id !== selectedClient()?.id) continue;
      for (const site of client.sites ?? []) {
        const name = site.industry_name || "No industry";
        counts.set(name, (counts.get(name) ?? 0) + (site.people ?? []).length);
      }
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  });
  const industryDonut = createMemo(() => donutSlices(byIndustry().slice(0, 6)));
  const industryTotal = createMemo(() => byIndustry().reduce((sum, row) => sum + row.count, 0));
  const openManpower = createMemo(() =>
    (manpower.data ?? []).filter((row) => row.status === "open" && (!selectedClient() || row.client_name === selectedClient()?.name)),
  );
  const manpowerSlots = createMemo(() => openManpower().reduce((sum, row) => sum + row.headcount, 0));
  const visibleTime = createMemo(() =>
    (timeFiles.data ?? []).filter((row) => !selectedClient() || row.client_name === selectedClient()?.name).slice(0, 8),
  );
  const visibleBills = createMemo(() =>
    (bills.data ?? []).filter((row) => !selectedClient() || row.client_name === selectedClient()?.name).slice(0, 8),
  );
  const billTotal = createMemo(() => visibleBills().reduce((sum, row) => sum + (row.total || 0), 0));
  const dtrAccepted = createMemo(() => visibleTime().filter((row) => row.status === "accepted").length);
  const dtrSubmitted = createMemo(() => visibleTime().filter((row) => row.status === "submitted" || row.status === "accepted").length);
  const dtrWaiting = createMemo(() => visibleTime().filter((row) => row.status === "submitted").length);
  const expiredDocs = createMemo(() => (documents.data ?? []).filter((row) => row.late));
  const expiringDocs = createMemo(() =>
    (documents.data ?? []).filter((row) => !row.late && row.expires_on !== "" && row.expires_on <= soon),
  );
  const leaveThisWeek = createMemo(() =>
    (leaveRows.data ?? []).filter((row) => row.date_from <= week.end && row.date_to >= week.start && (row.status === "approved" || row.status === "submitted")),
  );
  const weekDays = createMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((label, i) => {
      const date = addDays(week.start, i);
      const dayNum = Number(date.slice(8, 10));
      const leaves = leaveThisWeek()
        .filter((row) => row.date_from <= date && row.date_to >= date)
        .slice(0, 3)
        .map((row) => ({
          text: `${row.employee_name.split(" ").slice(-1)[0] || row.employee_name} · ${row.leave_name}`,
        }));
      const holiday = (holidays.data ?? []).find((row) => row.holiday_date === date);
      return { label, date, dayNum, leaves, holiday, isToday: date === today };
    });
  });
  const comingHolidays = createMemo(() => (holidays.data ?? []).filter((row) => row.holiday_date >= today).slice(0, 4));
  const comingCutoffs = createMemo(() =>
    (cutoffs.data ?? []).filter((row) => row.cutoff_end >= today).sort((a, b) => a.cutoff_end.localeCompare(b.cutoff_end)).slice(0, 4),
  );
  const pipeline = createMemo(() => {
    const rows = PIPELINE.map(([id, label]) => ({ id, label, count: (applications.data ?? []).filter((row) => row.status === id).length }));
    const max = Math.max(1, ...rows.map((row) => row.count));
    return rows.map((row, i) => {
      const prev = i === 0 ? row.count : rows[i - 1].count;
      const conv = prev > 0 ? Math.round((row.count / prev) * 100) : 0;
      return { ...row, width: Math.max(12, Math.round((row.count / max) * 100)), conv: i === 0 ? null : conv };
    });
  });
  const count = (key: keyof Overview) => overview.data?.[key] ?? 0;
  const headcount = () => count("active_employees");
  const latestPeriod = createMemo(() => periods.data?.[0]);
  const payIdx = createMemo(() => (latestPeriod() ? payStepIndex(latestPeriod()!.status) : -1));
  const pendingApprovals = createMemo(() => count("leave_waiting") + count("requests_waiting"));
  const utilPct = createMemo(() => {
    const d = deployed();
    const b = bench();
    const denom = d + b;
    return denom > 0 ? Math.round((d / denom) * 100) : null;
  });

  const queueAll = createMemo(() => {
    const data = overview.data;
    const items: QueueItem[] = [];
    const push = (n: number | undefined, item: QueueItem) => {
      if ((n ?? 0) > 0) items.push(item);
    };
    push(data?.late_workplace_problems, {
      group: "case",
      icon: "⚖",
      title: `${data?.late_workplace_problems} late workplace problems`,
      detail: "Past the target date",
      href: "/app/hr/workplace-problems",
      action: "Assign",
      badge: "Late",
      tone: "danger",
    });
    push(data?.open_discipline_cases, {
      group: "case",
      icon: "⚖",
      title: `${data?.open_discipline_cases} open discipline cases`,
      detail: "Not closed or cancelled",
      href: "/app/hr/discipline",
      action: "Open case",
      badge: "Open",
      tone: "warning",
    });
    push(data?.evaluations_due, {
      group: "eval",
      icon: "★",
      title: `${data?.evaluations_due} evaluations due`,
      detail: "Open the evaluation list",
      href: "/app/hr/evaluations",
      action: "Review",
      badge: "Due",
      tone: "warning",
    });
    push(data?.leave_waiting, {
      group: "req",
      icon: "🌴",
      title: `${data?.leave_waiting} leave requests pending`,
      detail: "Status is still submitted",
      href: "/app/hr/leave",
      action: "Approve",
      badge: String(data?.leave_waiting ?? 0),
      tone: "neutral",
    });
    push(data?.requests_waiting, {
      group: "req",
      icon: "📝",
      title: `${data?.requests_waiting} employee requests pending`,
      detail: "Loans, pay questions, and other requests",
      href: "/app/hr/requests",
      action: "Review",
      badge: String(data?.requests_waiting ?? 0),
      tone: "neutral",
    });
    push(data?.pay_questions_waiting, {
      group: "pay",
      icon: "₱",
      title: `${data?.pay_questions_waiting} pay questions waiting`,
      detail: "On the requests list",
      href: "/app/hr/requests",
      action: "Review",
      badge: "Waiting",
      tone: "warning",
    });
    if (mode.enabled()) {
      push(openManpower().length, {
        group: "mr",
        icon: "📣",
        title: `${openManpower().length} open manpower requests`,
        detail: `${manpowerSlots()} slots`,
        href: "/app/hr/manpower-requests",
        action: "Shortlist",
        badge: "Open",
        tone: "neutral",
      });
      push(dtrWaiting(), {
        group: "time",
        icon: "🕒",
        title: `${dtrWaiting()} client time files submitted`,
        detail: "Not accepted yet. These do not change attendance.",
        href: "/app/hr/attendance/client-dtr",
        action: "Follow up",
        badge: "Waiting",
        tone: "warning",
      });
    }
    push(expiredDocs().length, {
      group: "doc",
      icon: "📄",
      title: `${expiredDocs().length} documents past their date`,
      detail: "Expiry is before today",
      href: "/app/hr/compliance",
      action: "View",
      badge: "Critical",
      tone: "danger",
    });
    push(expiringDocs().length, {
      group: "doc",
      icon: "📄",
      title: `${expiringDocs().length} documents expire within 30 days`,
      detail: "Still on or before the date",
      href: "/app/hr/compliance",
      action: "View",
      badge: "≤30 d",
      tone: "warning",
    });
    return items;
  });

  const queue = createMemo(() => {
    const group = queueFilter();
    return group ? queueAll().filter((item) => item.group === group) : queueAll();
  });

  const shown = (id: string) => prefs()[id] !== false;
  const savePref = (id: string, on: boolean) => {
    const next = { ...prefs(), [id]: on };
    setPrefs(next);
    if (typeof localStorage !== "undefined") localStorage.setItem(PREF_KEY, JSON.stringify(next));
  };

  const refresh = () => {
    void overview.refetch();
    void applications.refetch();
    void documents.refetch();
    void leaveRows.refetch();
    void holidays.refetch();
    void cutoffs.refetch();
    void periods.refetch();
    if (mode.enabled()) {
      void clients.refetch();
      void assignments.refetch();
      void workforce.refetch();
      void manpower.refetch();
      void timeFiles.refetch();
      void bills.refetch();
    }
    setUpdated(manilaClock());
  };

  const exportCounts = () => {
    const rows = [
      ["Headcount", String(count("active_employees"))],
      ["Applicants", String(count("applicants"))],
      ["Late problems", String(count("late_workplace_problems"))],
      ["Leave waiting", String(count("leave_waiting"))],
      ["Requests waiting", String(count("requests_waiting"))],
    ];
    if (mode.enabled()) rows.splice(1, 0, ["Deployed", String(deployed())]);
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "hr-overview.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const runSample = async (path: string, ok: string) => {
    setBusy(true);
    const res = await apiFetch(path, { method: "POST", body: "{}" }, { silent: true });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update sample data.");
      return;
    }
    toast.success(ok);
    void qc.invalidateQueries({ queryKey: ["hr-overview"] });
    refresh();
  };

  const deployedPct = () => {
    const h = headcount();
    if (!h || !assignments.data) return "";
    return `${Math.round((deployed() / h) * 100)}% of headcount`;
  };

  return (
    <HrLayout>
      <div classList={{ "hr-dash-loading": overview.isPending }}>
        <HrPageHead
          crumb={<>HR &amp; Payroll › Overview › HR Overview</>}
          title="HR Overview"
          subtitle="Agency command center — workforce, deployment, attendance, payroll and compliance at a glance. Every number opens the filtered page."
          actions={
            <div class="hr-actions">
              <details class="hr-menu">
                <summary class="hr-btn hr-btn-primary">⚡ Quick actions ▾</summary>
                <div>
                  <A href="/app/hr/employees">+ Add employee</A>
                  <A href="/app/hr/applicants">+ New applicant</A>
                  <Show when={mode.enabled()}>
                    <A href="/app/hr/deployments">Deploy to client</A>
                    <A href="/app/hr/manpower-requests">New manpower request</A>
                    <A href="/app/hr/clients/portal-access">Invite client user</A>
                  </Show>
                  <A href="/app/hr/attendance/entry">Encode DTR</A>
                  <A href="/app/hr/payroll-runs">Start payroll run</A>
                  <A href="/app/hr/discipline">Issue NTE</A>
                  <A href="/app/hr/records">Post a notice</A>
                </div>
              </details>
              <button type="button" class="hr-btn" onClick={() => setCustomize(true)}>⚙ Customize</button>
              <details class="hr-menu">
                <summary class="hr-btn">Export ▾</summary>
                <div>
                  <button type="button" class="menu-item" onClick={() => window.print()}>Print / Save as PDF</button>
                  <button type="button" class="menu-item" onClick={exportCounts}>KPIs as CSV</button>
                  <button type="button" class="menu-item" disabled title="Needs backend">
                    Schedule e-mail digest <HrPlanned />
                  </button>
                </div>
              </details>
            </div>
          }
        />

        <div class="hr-filters" role="group" aria-label="Dashboard filters">
          <Show when={mode.enabled()}>
            <select class="rounded-lg border border-stroke bg-surface px-2 text-sm" aria-label="Client" value={clientId()} onChange={(event) => setClientId(event.currentTarget.value)}>
              <option value="">All clients</option>
              <For each={clients.data ?? []}>{(client) => <option value={String(client.id)}>{client.name}</option>}</For>
            </select>
          </Show>
          <span class="grow" />
          <span class="hr-muted">Updated {updated()}</span>
          <button type="button" class="hr-btn hr-btn-sm" aria-label="Refresh" onClick={refresh}>⟳</button>
        </div>

        <Show when={overview.isError}>
          <div class="mb-4 rounded-lg border border-l-[3px] border-stroke border-l-red-600 bg-surface px-4 py-3 text-sm">
            The overview counts did not load.
            <button type="button" class="ml-2 text-brand-700" onClick={() => void overview.refetch()}>Try again</button>
          </div>
        </Show>

        <div class="hr-kpis" aria-label="Key figures">
          <A href="/app/hr/employees" class="hr-kpi" classList={{ zero: overview.data != null && headcount() === 0 }} title="Open Headcount">
            <div class="v">{overview.data ? headcount() : "—"}</div>
            <div class="l">Headcount</div>
          </A>

          <Show when={mode.enabled()}>
            <A href="/app/hr/deployments" class="hr-kpi" classList={{ zero: assignments.data != null && deployed() === 0 }} title="Open Deployed">
              <div class="v">{assignments.data ? deployed() : "—"}</div>
              <div class="l">Deployed</div>
              <Show when={deployedPct()}><div class="h">{deployedPct()}</div></Show>
            </A>
            <A href="/app/hr/workforce" class="hr-kpi" classList={{ zero: workforce.data != null && bench() === 0 }} title="Open Bench / pooling">
              <div class="v">{workforce.data ? bench() : "—"}</div>
              <div class="l">Bench / pooling</div>
              <div class="h">Not on a site</div>
            </A>
            <A href="/app/hr/manpower-requests" class="hr-kpi" title="Open Fill rate">
              <div class="v">—</div>
              <div class="l">Fill rate <HrPlanned /></div>
              <div class="h">needs filled ÷ requested history</div>
            </A>
            <A href="/app/hr/manpower-requests" class="hr-kpi" title="Open Time-to-deploy">
              <div class="v">—</div>
              <div class="l">Time-to-deploy <HrPlanned /></div>
              <div class="h">request → first day</div>
            </A>
          </Show>

          <A href="/app/hr/reports" class="hr-kpi" title="Open Turnover">
            <div class="v">—</div>
            <div class="l">Turnover (monthly) <HrPlanned /></div>
            <div class="h">needs hire / separation series</div>
          </A>

          <Show when={mode.enabled()}>
            <A href="/app/hr/deployments" class="hr-kpi" classList={{ zero: utilPct() === 0 }} title="Open Utilization">
              <div class="v">{utilPct() == null ? "—" : `${utilPct()}%`}</div>
              <div class="l">Utilization</div>
              <div class="h">deployed ÷ (deployed + bench)</div>
            </A>
            <A href="/app/hr/manpower-requests" class="hr-kpi" classList={{ zero: manpower.data != null && openManpower().length === 0 }} title="Open manpower requests">
              <div class="v">{manpower.data ? `${openManpower().length}${manpowerSlots() ? ` · ${manpowerSlots()} slots` : ""}` : "—"}</div>
              <div class="l">Open manpower requests</div>
            </A>
          </Show>

          <A href="/app/hr/employees" class="hr-kpi warn" title="Contracts ending">
            <div class="v">—</div>
            <div class="l">Contracts ending ≤30d <HrPlanned /></div>
            <div class="h">needs contract end dates</div>
          </A>

          <A href="/app/hr/compliance" class="hr-kpi" classList={{ warn: expiringDocs().length > 0, alert: expiredDocs().length > 0, zero: documents.data != null && expiredDocs().length === 0 && expiringDocs().length === 0 }} title="Expiring documents">
            <div class="v">{documents.data ? expiringDocs().length + expiredDocs().length : "—"}</div>
            <div class="l">Expiring documents / IDs</div>
            <Show when={documents.data}>
              <div class="h">{expiredDocs().length} past · {expiringDocs().length} ≤30d</div>
            </Show>
          </A>

          <A href="/app/hr/requests" class="hr-kpi" classList={{ warn: pendingApprovals() > 0, zero: overview.data != null && pendingApprovals() === 0 }} title="Pending approvals">
            <div class="v">{overview.data ? pendingApprovals() : "—"}</div>
            <div class="l">Pending approvals</div>
            <Show when={overview.data}>
              <div class="h">leave {count("leave_waiting")} · requests {count("requests_waiting")}</div>
            </Show>
          </A>

          <A href="/app/hr/payroll-runs" class="hr-kpi" title="Payroll current">
            <div class="v">{latestPeriod() ? labelize(latestPeriod()!.status) : "—"}</div>
            <div class="l">Payroll{latestPeriod() ? ` · ${latestPeriod()!.period_label}` : ""}</div>
            <div class="h">{latestPeriod() ? `${latestPeriod()!.period_start} – ${latestPeriod()!.period_end}` : "No period"}</div>
          </A>

          <Show when={mode.enabled()}>
            <A href="/app/hr/attendance/client-dtr" class="hr-kpi" classList={{ alert: dtrWaiting() > 0, zero: timeFiles.data != null && visibleTime().length === 0 }} title="Client DTR submitted">
              <div class="v">{timeFiles.data ? `${dtrSubmitted()} / ${visibleTime().length || 0}` : "—"}</div>
              <div class="l">Client DTR submitted</div>
              <Show when={timeFiles.data && dtrWaiting() > 0}><div class="h">{dtrWaiting()} waiting acceptance</div></Show>
            </A>
            <A href="/app/hr/client-billing" class="hr-kpi" classList={{ zero: bills.data != null && billTotal() === 0 }} title="Receivables">
              <div class="v">{bills.data ? formatAmount(billTotal()) : "—"}</div>
              <div class="l">Receivables</div>
              <div class="h">Billed totals (not collections)</div>
            </A>
            <A href="/app/hr/client-billing" class="hr-kpi" title="Margin per client">
              <div class="v">—</div>
              <div class="l">Margin per client <HrPlanned /></div>
              <div class="h">needs billing + payroll cost</div>
            </A>
          </Show>

          <A href="/app/hr/applicants" class="hr-kpi" classList={{ zero: overview.data != null && count("applicants") === 0 }} title="Applicants">
            <div class="v">{overview.data ? count("applicants") : "—"}</div>
            <div class="l">Applicants</div>
          </A>
          <A href="/app/hr/workplace-problems" class="hr-kpi" classList={{ alert: count("late_workplace_problems") > 0, zero: overview.data != null && count("late_workplace_problems") === 0 }} title="Late problems">
            <div class="v">{overview.data ? count("late_workplace_problems") : "—"}</div>
            <div class="l">Late problems</div>
          </A>
          <A href="/app/hr/evaluations" class="hr-kpi" classList={{ warn: count("evaluations_due") > 0, zero: overview.data != null && count("evaluations_due") === 0 }} title="Evaluations due">
            <div class="v">{overview.data ? count("evaluations_due") : "—"}</div>
            <div class="l">Evaluations due</div>
          </A>
        </div>

        <div class="hr-widgets">
          <Show when={shown("attn")}>
            <section class="hr-w s8" aria-label="Needs your attention">
              <header>
                <h3>Needs your attention</h3>
                <span class="grow" />
                <HrBadge tone={queueAll().length > 0 ? "danger" : "neutral"}>{queueAll().length} items</HrBadge>
              </header>
              <div class="hr-chiprow" role="group" aria-label="Filter queue">
                <For each={QUEUE_CHIPS}>
                  {([id, label]) => (
                    <button type="button" classList={{ on: queueFilter() === id }} onClick={() => setQueueFilter(id)}>{label}</button>
                  )}
                </For>
              </div>
              <Show when={!overview.isPending} fallback={<div class="hr-wempty">Loading counts…</div>}>
                <ul class="hr-aq">
                  <For each={queue()} fallback={<li><div class="hr-wempty" style={{ width: "100%" }}>📭 Nothing here for the selected filters.</div></li>}>
                    {(item) => (
                      <li>
                        <span class="ico" aria-hidden="true">{item.icon}</span>
                        <span class="t">
                          <b>{item.title}</b>
                          <span class="xs">{item.detail}</span>
                        </span>
                        <HrBadge tone={item.tone}>{item.badge}</HrBadge>
                        <A href={item.href} class="open">{item.action}</A>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          </Show>

          <Show when={shown("ev")}>
            <section class="hr-w s4" aria-label="Upcoming events & deadlines">
              <header>
                <h3>Upcoming events &amp; deadlines</h3>
                <span class="grow" />
              </header>
              <ul class="hr-feed">
                <For each={comingCutoffs()}>
                  {(row) => (
                    <li>
                      <span class="dot" aria-hidden="true">🕒</span>
                      <span class="grow">
                        <b>{row.label}</b>
                        <span class="xs" style={{ display: "block" }}>{row.cutoff_start} – {row.cutoff_end}{row.pay_date ? ` · pay ${row.pay_date}` : ""}</span>
                      </span>
                      <A class="xs" href="/app/hr/attendance/setup">Open</A>
                    </li>
                  )}
                </For>
                <Show when={latestPeriod()?.period_end}>
                  <li>
                    <span class="dot" aria-hidden="true">💸</span>
                    <span class="grow">
                      <b>Pay period</b>
                      <span class="xs" style={{ display: "block" }}>{latestPeriod()!.period_label} · {labelize(latestPeriod()!.status)}</span>
                    </span>
                    <A class="xs" href="/app/hr/payroll-runs">Open</A>
                  </li>
                </Show>
                <For each={comingHolidays()}>
                  {(row) => (
                    <li>
                      <span class="dot" aria-hidden="true">🏖</span>
                      <span class="grow">
                        <b>Holiday · {row.name}</b>
                        <span class="xs" style={{ display: "block" }}>{row.holiday_date} · {labelize(row.holiday_type)}</span>
                      </span>
                      <A class="xs" href="/app/hr/attendance/setup">Open</A>
                    </li>
                  )}
                </For>
                <li>
                  <span class="dot" aria-hidden="true">🎄</span>
                  <span class="grow">
                    <b>13th month pay</b>
                    <span class="xs" style={{ display: "block" }}>Due on or before 24 Dec (PD 851)</span>
                  </span>
                  <A class="xs" href="/app/hr/pay-items">Open</A>
                </li>
                <li>
                  <span class="dot" aria-hidden="true">🎂</span>
                  <span class="grow">
                    <b>Birthdays this week <HrPlanned /></b>
                    <span class="xs" style={{ display: "block" }}>Needs employee birth dates</span>
                  </span>
                </li>
                <li>
                  <span class="dot" aria-hidden="true">🎉</span>
                  <span class="grow">
                    <b>Work anniversaries <HrPlanned /></b>
                    <span class="xs" style={{ display: "block" }}>Needs hire-date series</span>
                  </span>
                </li>
                <li>
                  <span class="dot" aria-hidden="true">🧾</span>
                  <span class="grow">
                    <b>SSS / PhilHealth / Pag-IBIG remittance</b>
                    <span class="xs" style={{ display: "block" }}>Due per agency schedule</span>
                  </span>
                  <A class="xs" href="/app/hr/remittances">Open</A>
                </li>
                <li>
                  <span class="dot" aria-hidden="true">🏛</span>
                  <span class="grow">
                    <b>BIR withholding reports</b>
                    <span class="xs" style={{ display: "block" }}>Open government reports</span>
                  </span>
                  <A class="xs" href="/app/hr/reports">Open</A>
                </li>
              </ul>
            </section>
          </Show>

          <Show when={mode.enabled() && shown("dep")}>
            <section class="hr-w" aria-label="Deployment by client">
              <header>
                <h3>Deployment by client</h3>
                <span class="grow" />
                <A href="/app/hr/deployments" class="text-sm text-brand-700">Roster</A>
              </header>
              <For each={byClient()} fallback={<div class="hr-wempty">No open placements.</div>}>
                {(row) => (
                  <div class="hr-hb">
                    <A href="/app/hr/clients" class="truncate">{row.name}</A>
                    <span class="hr-bar"><i style={{ width: `${Math.round((row.count / Math.max(1, byClient()[0]?.count ?? 1)) * 100)}%` }} /></span>
                    <b class="text-right tabular-nums">{row.count}</b>
                  </div>
                )}
              </For>
              <Show when={byClient().length > 0}><p class="hr-muted mt-2">Deployed headcount per client. Click a client to open clients.</p></Show>
            </section>
          </Show>

          <Show when={mode.enabled() && shown("ind")}>
            <section class="hr-w" aria-label="Deployed by industry">
              <header>
                <h3>Deployed by industry</h3>
                <span class="grow" />
              </header>
              <Show when={byIndustry().length > 0} fallback={<div class="hr-wempty">No one is placed on a site yet.</div>}>
                <div class="hr-donut-wrap">
                  <svg viewBox="0 0 40 40" width="120" height="120" role="img" aria-label="Deployed by industry">
                    <For each={industryDonut()}>
                      {(slice) => (
                        <circle
                          r="15.9"
                          cx="20"
                          cy="20"
                          fill="none"
                          stroke={slice.color}
                          stroke-width="7"
                          stroke-dasharray={slice.dasharray}
                          stroke-dashoffset={slice.dashoffset}
                        >
                          <title>{slice.name}: {slice.count}</title>
                        </circle>
                      )}
                    </For>
                    <text x="20" y="21.5" text-anchor="middle" font-size="6" font-weight="700">{industryTotal()}</text>
                  </svg>
                  <div class="hr-legend" style={{ "flex-direction": "column", gap: "4px" }}>
                    <For each={industryDonut()}>
                      {(slice) => (
                        <span><i style={{ background: slice.color }} />{slice.name} · {slice.count} ({slice.pct}%)</span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </section>
          </Show>

          <Show when={shown("trend")}>
            <section class="hr-w" aria-label="Headcount trend · 12 months">
              <header>
                <h3>Headcount trend · 12 months</h3>
                <span class="grow" />
                <HrPlanned />
              </header>
              <div class="hr-wempty">
                Needs a 12-month headcount / deployed series from the API.
                <div class="hr-legend" style={{ "justify-content": "center" }}>
                  <span><i style={{ background: "#2563EB" }} />Headcount</span>
                  <span><i style={{ background: "#10B981" }} />Deployed</span>
                </div>
              </div>
            </section>
          </Show>

          <Show when={shown("fun")}>
            <section class="hr-w" aria-label="Applicant pipeline">
              <header>
                <h3>Applicant pipeline</h3>
                <span class="grow" />
                <A href="/app/hr/applicants" class="text-sm text-brand-700">Applicants</A>
              </header>
              <div class="hr-fun">
                <For each={pipeline()}>
                  {(row) => (
                    <div class="st">
                      <A href={`/app/hr/applicants?status=${row.id}`} style={{ display: "block", width: `${row.width}%` }}>
                        <b>{applications.data ? row.count : "—"}</b>
                      </A>
                      <span>
                        {row.label}{" "}
                        <Show when={row.conv != null}>
                          <span class="hr-muted">({row.conv}% of prev.)</span>
                        </Show>
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <p class="hr-muted mt-2">Conversion = stage ÷ previous stage. Live applicant statuses only.</p>
            </section>
          </Show>

          <Show when={mode.enabled() && shown("mr")}>
            <section class="hr-w" aria-label="Open manpower requests">
              <header>
                <h3>Open manpower requests</h3>
                <span class="grow" />
                <A href="/app/hr/manpower-requests" class="open">All requests →</A>
              </header>
              <div class="overflow-x-auto">
                <table class="hr-tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Site</th>
                      <th>Details</th>
                      <th>Filled</th>
                      <th class="num">Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={openManpower().slice(0, 8)} fallback={<tr><td colspan="5"><div class="hr-wempty">No open requests.</div></td></tr>}>
                      {(row) => (
                        <tr>
                          <td>{row.client_name}</td>
                          <td>{row.site_name}</td>
                          <td class="max-w-[14rem] truncate">{row.details || "—"}</td>
                          <td>
                            <span class="hr-prog"><i style={{ width: "0%" }} /></span>
                            <span class="hr-muted"> 0/{row.headcount}</span>
                          </td>
                          <td class="num">{row.headcount}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <A href="/app/hr/manpower-requests" class="open">All requests →</A>
                <A href="/app/hr/applicants" class="open">Applicant flow →</A>
              </div>
            </section>
          </Show>

          <Show when={shown("att")}>
            <section class="hr-w" aria-label="Attendance today">
              <header>
                <h3>Attendance today</h3>
                <span class="grow" />
                <HrPlanned />
              </header>
              <div class="hr-stack" role="img" aria-label="Attendance today (planned)">
                <i style={{ width: "100%", background: "#e2e8f0" }} title="No live attendance rollup yet" />
              </div>
              <div class="hr-legend">
                <span><i style={{ background: "#10B981" }} />Present</span>
                <span><i style={{ background: "#F59E0B" }} />Late</span>
                <span><i style={{ background: "#EF4444" }} />Absent</span>
                <span><i style={{ background: "#8B5CF6" }} />On leave</span>
              </div>
              <div class="hr-wempty">Needs a today attendance rollup API (present / late / absent / on leave).</div>
              <p class="hr-muted">As of {updated()} · leave this week is listed under Who&apos;s out.</p>
            </section>
          </Show>

          <Show when={mode.enabled() && shown("dtr")}>
            <section class="hr-w" aria-label="Client DTR status">
              <header>
                <h3>Client DTR status</h3>
                <span class="grow" />
                <HrBadge tone={dtrWaiting() > 0 ? "warning" : "success"}>{dtrAccepted()} accepted</HrBadge>
              </header>
              <div class="overflow-x-auto">
                <table class="hr-tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Site</th>
                      <th>Period</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={visibleTime()} fallback={<tr><td colspan="4"><div class="hr-wempty">No time files yet.</div></td></tr>}>
                      {(row) => (
                        <tr>
                          <td>{row.client_name}</td>
                          <td>{row.site_name}</td>
                          <td class="hr-muted">{row.period_start} – {row.period_end}</td>
                          <td><HrBadge tone={timeStatusTone(row.status)}>{labelize(row.status)}</HrBadge></td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <div class="mt-2">
                <A href="/app/hr/attendance/client-dtr" class="open">Open Client DTR inbox →</A>
              </div>
            </section>
          </Show>

          <Show when={shown("pay")}>
            <section class="hr-w s4" aria-label="Payroll · current cut-off">
              <header>
                <h3>Payroll · current cut-off</h3>
                <span class="grow" />
              </header>
              <Show when={latestPeriod()} fallback={<div class="hr-wempty">No pay period yet.</div>}>
                {(period) => (
                  <>
                    <ol class="hr-stepper">
                      <For each={[...PAY_STEPS]}>
                        {(label, i) => (
                          <li classList={{ done: i() < payIdx(), on: i() === payIdx() }}>{label}</li>
                        )}
                      </For>
                    </ol>
                    <dl class="text-sm">
                      <div class="mb-1 flex gap-2"><dt class="hr-muted">Cut-off</dt><dd>{period().period_label} · {period().period_start} – {period().period_end}</dd></div>
                      <div class="mb-1 flex gap-2"><dt class="hr-muted">Status</dt><dd><HrBadge tone="info">{labelize(period().status)}</HrBadge></dd></div>
                      <Show when={mode.enabled()}>
                        <div class="mb-1 flex gap-2"><dt class="hr-muted">Deployed</dt><dd>{deployed()}</dd></div>
                        <div class="mb-1 flex gap-2">
                          <dt class="hr-muted">Blocked</dt>
                          <dd>
                            {dtrWaiting()} time files waiting →{" "}
                            <A href="/app/hr/attendance/client-dtr" class="text-brand-700">resolve</A>
                          </dd>
                        </div>
                      </Show>
                      <div class="mb-1 flex gap-2"><dt class="hr-muted">Gross</dt><dd>Pay amounts stay on payroll pages</dd></div>
                    </dl>
                  </>
                )}
              </Show>
              <div class="mt-3 flex flex-wrap gap-2">
                <A href="/app/hr/payroll-runs" class="hr-btn hr-btn-primary hr-btn-sm">Continue run →</A>
                <A href="/app/hr/payroll-runs" class="open">All runs</A>
              </div>
            </section>
          </Show>

          <Show when={mode.enabled() && shown("bill")}>
            <section class="hr-w s8" aria-label="Receivables & billing snapshot">
              <header>
                <h3>Receivables &amp; billing snapshot</h3>
                <span class="grow" />
              </header>
              <div class="hr-stack" role="img" aria-label="Billed total">
                <i style={{ width: billTotal() > 0 ? "100%" : "0%", background: "#10B981" }} title={`Billed ${formatAmount(billTotal())}`} />
              </div>
              <div class="hr-legend">
                <span><i style={{ background: "#10B981" }} />Billed {formatAmount(billTotal())}</span>
                <span><i style={{ background: "#F59E0B" }} />Aging <HrPlanned /></span>
                <span><i style={{ background: "#EF4444" }} />Overdue <HrPlanned /></span>
              </div>
              <div class="overflow-x-auto mt-2">
                <table class="hr-tbl">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th class="num">Billed</th>
                      <th class="num">Collected</th>
                      <th class="num">Overdue</th>
                      <th>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={visibleBills()} fallback={<tr><td colspan="5"><div class="hr-wempty">No client bills yet.</div></td></tr>}>
                      {(row) => (
                        <tr>
                          <td>{row.client_name} · {row.site_name}</td>
                          <td class="num">{formatAmount(row.total)}</td>
                          <td class="num">—</td>
                          <td class="num">—</td>
                          <td><HrPlanned /></td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <p class="hr-muted mt-2">Margin per client = billing − payroll cost − statutory share. Needs backend join — shown as Planned. Billed amounts are charges, not collections or worker pay.</p>
            </section>
          </Show>

          <Show when={shown("cal")}>
            <section class="hr-w" aria-label="Who's out · this week">
              <header>
                <h3>Who&apos;s out · this week</h3>
                <span class="grow" />
                <A href="/app/hr/leave" class="text-sm text-brand-700">Leave</A>
              </header>
              <div class="hr-mcal">
                <For each={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}>
                  {(d) => <div class="dh">{d}</div>}
                </For>
                <For each={weekDays()}>
                  {(day) => (
                    <div classList={{ tod: day.isToday }}>
                      <b>{day.dayNum}</b>
                      <For each={day.leaves}>{(lv) => <span class="lv">{lv.text}</span>}</For>
                      <Show when={day.holiday}><span class="ev">{day.holiday!.name}</span></Show>
                    </div>
                  )}
                </For>
              </div>
              <div class="hr-legend">
                <span><i style={{ background: "#FEF3C7" }} />Leave</span>
                <span><i style={{ background: "#DBEAFE" }} />Holiday</span>
                <A href="/app/hr/leave">Full leave calendar →</A>
              </div>
              <p class="hr-muted">Week of {week.start} – {week.end} · from submitted/approved leave in the latest 100 requests.</p>
            </section>
          </Show>

          <Show when={shown("comp")}>
            <section class="hr-w" aria-label="Compliance alerts">
              <header>
                <h3>Compliance alerts</h3>
                <span class="grow" />
              </header>
              <ul class="hr-aq">
                <Show when={expiredDocs().length > 0}>
                  <li>
                    <HrBadge tone="danger">Critical</HrBadge>
                    <span class="t">
                      <b>{expiredDocs().length} documents past date</b>
                      <span class="xs">Expiry is before today</span>
                    </span>
                    <A href="/app/hr/compliance" class="open">View</A>
                  </li>
                </Show>
                <Show when={expiringDocs().length > 0}>
                  <li>
                    <HrBadge tone="warning">Warning</HrBadge>
                    <span class="t">
                      <b>{expiringDocs().length} documents expiring ≤30 d</b>
                      <span class="xs">Still on or before the date</span>
                    </span>
                    <A href="/app/hr/compliance" class="open">View</A>
                  </li>
                </Show>
                <For each={[...expiredDocs(), ...expiringDocs()].slice(0, 5)}>
                  {(row) => (
                    <li>
                      <HrBadge tone={row.late ? "danger" : "warning"}>{row.late ? "Critical" : "Warning"}</HrBadge>
                      <span class="t">
                        <b>{row.employee_name} · {row.title || row.doc_type}</b>
                        <span class="xs">{row.expires_on || "No date"}</span>
                      </span>
                      <A href="/app/hr/compliance" class="open">View</A>
                    </li>
                  )}
                </For>
                <Show when={expiredDocs().length === 0 && expiringDocs().length === 0}>
                  <li><div class="hr-wempty" style={{ width: "100%" }}>No document is past its date or due within 30 days.</div></li>
                </Show>
              </ul>
            </section>
          </Show>

          <Show when={shown("feed")}>
            <section class="hr-w" aria-label="Recent activity">
              <header>
                <h3>Recent activity</h3>
                <span class="grow" />
                <HrPlanned />
              </header>
              <ul class="hr-feed">
                <li>
                  <span class="dot" aria-hidden="true">📣</span>
                  <span class="grow">Activity feed needs an audit log API</span>
                  <span class="xs">—</span>
                </li>
              </ul>
              <A class="xs" href="/app/hr/reports">Reports →</A>
            </section>
          </Show>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-3 text-sm">
        <A href="/app/hr/workplace-problems" class="text-brand-700">Open problems {overview.data ? count("open_workplace_problems") : ""}</A>
        <A href="/app/hr/discipline" class="text-brand-700">Discipline cases {overview.data ? count("open_discipline_cases") : ""}</A>
        <A href="/app/hr/absenteeism" class="text-brand-700">Absenteeism alerts {overview.data ? count("open_absence_alerts") : ""}</A>
        <A href="/app/hr/leave" class="text-brand-700">Pending leave {overview.data ? count("pending_leave") : ""}</A>
        <A href="/app/hr/reports" class="text-brand-700">Discipline report</A>
      </div>

      <section class="mt-6 rounded-lg border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="text-lg font-medium">Sample HR data</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Sample employees are excluded from a real payroll run while the batch exists. Remove deletes only the sample batch.
          Sample attendance, payroll, and withholding are in 2099. Set the attendance month to 2099-01 and the government report year to 2099.
          The first client portal login is listed on Portal access.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void runSample("/api/v1/hr/sample-data", "Sample HR data added.")}>Seed</button>
          <button type="button" class="hr-btn" disabled={busy()} onClick={() => setConfirmRemove(true)}>Remove sample data</button>
        </div>
        <Show when={confirmRemove()}>
          <div class="mt-3 rounded-lg border border-stroke p-3">
            <p class="text-sm">Remove the sample HR batch? This deletes only that batch.</p>
            <div class="mt-2 flex gap-2">
              <button type="button" class="hr-btn" onClick={() => setConfirmRemove(false)}>Cancel</button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => { setConfirmRemove(false); void runSample("/api/v1/hr/sample-data/retract", "Sample HR data removed."); }}>Remove sample data</button>
            </div>
          </div>
        </Show>
      </section>

      <Show when={customize()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Customize dashboard" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") setCustomize(false); }}>
          <div class="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border border-stroke bg-surface p-4">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Customize dashboard</h2>
              <button type="button" class="text-sm" aria-label="Close" onClick={() => setCustomize(false)}>Close</button>
            </div>
            <p class="mb-3 text-sm text-text-secondary">Show or hide sections on this browser.</p>
            <For each={WIDGETS}>
              {([id, label]) => (
                <label class="mb-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shown(id)} onChange={(event) => savePref(id, event.currentTarget.checked)} />
                  {label}
                </label>
              )}
            </For>
            <button type="button" class="mt-3 text-sm text-brand-700" onClick={() => { setPrefs({}); if (typeof localStorage !== "undefined") localStorage.removeItem(PREF_KEY); }}>Reset</button>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
