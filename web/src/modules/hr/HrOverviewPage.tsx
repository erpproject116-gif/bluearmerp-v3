import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatAmount } from "../../shared/money";
import { useToast } from "../../shared/toast";
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
type Manpower = { id: number; client_name: string; site_name: string; headcount: number; details: string; status: string };
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

const WIDGETS = [
  ["attn", "Needs your attention"],
  ["dep", "Deployment by client"],
  ["ind", "Deployed by industry"],
  ["fun", "Applicant pipeline"],
  ["mr", "Open manpower requests"],
  ["dtr", "Client time files"],
  ["pay", "Latest pay period"],
  ["bill", "Client bills"],
  ["cal", "Leave this week"],
  ["comp", "Document dates"],
  ["ev", "Holidays and cut-offs"],
] as const;

type QueueItem = { group: string; title: string; detail: string; href: string; tone: "danger" | "warn" | "neutral" };

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
  const openManpower = createMemo(() =>
    (manpower.data ?? []).filter((row) => row.status === "open" && (!selectedClient() || row.client_name === selectedClient()?.name)),
  );
  const visibleTime = createMemo(() =>
    (timeFiles.data ?? []).filter((row) => !selectedClient() || row.client_name === selectedClient()?.name).slice(0, 8),
  );
  const visibleBills = createMemo(() =>
    (bills.data ?? []).filter((row) => !selectedClient() || row.client_name === selectedClient()?.name).slice(0, 8),
  );
  const expiredDocs = createMemo(() => (documents.data ?? []).filter((row) => row.late));
  const expiringDocs = createMemo(() =>
    (documents.data ?? []).filter((row) => !row.late && row.expires_on !== "" && row.expires_on <= soon),
  );
  const leaveThisWeek = createMemo(() =>
    (leaveRows.data ?? []).filter((row) => row.date_from <= week.end && row.date_to >= week.start && (row.status === "approved" || row.status === "submitted")).slice(0, 8),
  );
  const comingHolidays = createMemo(() => (holidays.data ?? []).filter((row) => row.holiday_date >= today).slice(0, 4));
  const comingCutoffs = createMemo(() =>
    (cutoffs.data ?? []).filter((row) => row.cutoff_end >= today).sort((a, b) => a.cutoff_end.localeCompare(b.cutoff_end)).slice(0, 4),
  );
  const pipeline = createMemo(() => PIPELINE.map(([id, label]) => ({ id, label, count: (applications.data ?? []).filter((row) => row.status === id).length })));
  const pipelineMax = createMemo(() => Math.max(1, ...pipeline().map((row) => row.count)));

  const queue = createMemo(() => {
    const data = overview.data;
    const items: QueueItem[] = [];
    const push = (count: number | undefined, item: Omit<QueueItem, "title"> & { title: string }) => {
      if ((count ?? 0) > 0) items.push(item);
    };
    push(data?.late_workplace_problems, { group: "case", title: `${data?.late_workplace_problems} late workplace problems`, detail: "Past the target date", href: "/app/hr/workplace-problems", tone: "danger" });
    push(data?.open_discipline_cases, { group: "case", title: `${data?.open_discipline_cases} open discipline cases`, detail: "Not closed or cancelled", href: "/app/hr/discipline", tone: "warn" });
    push(data?.open_absence_alerts, { group: "time", title: `${data?.open_absence_alerts} open absenteeism alerts`, detail: "From the absence rules", href: "/app/hr/absenteeism", tone: "warn" });
    push(data?.evaluations_due, { group: "eval", title: `${data?.evaluations_due} evaluations due`, detail: "Open the evaluation list", href: "/app/hr/evaluations", tone: "warn" });
    push(data?.leave_waiting, { group: "req", title: `${data?.leave_waiting} leave requests waiting`, detail: "Status is still submitted", href: "/app/hr/leave", tone: "neutral" });
    push(data?.requests_waiting, { group: "req", title: `${data?.requests_waiting} employee requests waiting`, detail: "Loans, pay questions, and other requests", href: "/app/hr/requests", tone: "neutral" });
    push(data?.loans_waiting, { group: "req", title: `${data?.loans_waiting} loans waiting`, detail: "On the requests list", href: "/app/hr/requests", tone: "neutral" });
    push(data?.pay_questions_waiting, { group: "pay", title: `${data?.pay_questions_waiting} pay questions waiting`, detail: "On the requests list", href: "/app/hr/requests", tone: "warn" });
    if (mode.enabled()) {
      push(openManpower().length, { group: "mr", title: `${openManpower().length} open manpower requests`, detail: `${openManpower().reduce((sum, row) => sum + row.headcount, 0)} slots`, href: "/app/hr/manpower-requests", tone: "neutral" });
      const waitingTime = visibleTime().filter((row) => row.status === "submitted").length;
      push(waitingTime, { group: "time", title: `${waitingTime} client time files submitted`, detail: "Not accepted yet. These do not change attendance.", href: "/app/hr/attendance/client-dtr", tone: "warn" });
    }
    push(expiredDocs().length, { group: "doc", title: `${expiredDocs().length} documents past their date`, detail: "Expiry is before today", href: "/app/hr/compliance", tone: "danger" });
    push(expiringDocs().length, { group: "doc", title: `${expiringDocs().length} documents expire within 30 days`, detail: "Still on or before the date", href: "/app/hr/compliance", tone: "warn" });
    const group = queueFilter();
    return group ? items.filter((item) => item.group === group) : items;
  });

  const count = (key: keyof Overview) => overview.data?.[key] ?? 0;
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

  const kpiClass = "block rounded-lg border border-stroke bg-surface px-4 py-3.5 shadow-sm transition hover:border-brand-500";

  return (
    <HrLayout>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">HR Overview</h1>
          <p class="mt-1 text-sm text-text-secondary">Live counts for this company. Each number opens its list.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <details class="hr-menu">
            <summary class="cursor-pointer list-none rounded-lg bg-brand-600 px-3 text-sm text-white">Quick actions</summary>
            <div>
              <A href="/app/hr/employees">Employees</A>
              <A href="/app/hr/applicants">Applicants</A>
              <Show when={mode.enabled()}>
                <A href="/app/hr/deployments">Deployments</A>
                <A href="/app/hr/manpower-requests">Manpower requests</A>
                <A href="/app/hr/clients/portal-access">Portal access</A>
              </Show>
              <A href="/app/hr/attendance/entry">DTR entry</A>
              <A href="/app/hr/payroll-runs">Payroll</A>
              <A href="/app/hr/discipline">Discipline</A>
              <A href="/app/hr/records">Policies and notices</A>
            </div>
          </details>
          <button type="button" class="rounded-lg border border-stroke px-3 text-sm" onClick={() => setCustomize(true)}>Customize</button>
          <details class="hr-menu">
            <summary class="cursor-pointer list-none rounded-lg border border-stroke px-3 text-sm">Export</summary>
            <div>
              <button type="button" class="menu-item" onClick={() => window.print()}>Print</button>
              <button type="button" class="menu-item" onClick={exportCounts}>Counts as CSV</button>
            </div>
          </details>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <Show when={mode.enabled()}>
          <select class="rounded-lg border border-stroke bg-surface px-2 text-sm" aria-label="Client" value={clientId()} onChange={(event) => setClientId(event.currentTarget.value)}>
            <option value="">All clients</option>
            <For each={clients.data ?? []}>{(client) => <option value={String(client.id)}>{client.name}</option>}</For>
          </select>
        </Show>
        <span class="ml-auto text-xs text-text-secondary">Updated {updated()}</span>
        <button type="button" class="rounded-lg border border-stroke px-2 text-sm" aria-label="Refresh" onClick={refresh}>Refresh</button>
      </div>

      <Show when={overview.isError}>
        <div class="mb-4 rounded-lg border border-l-[3px] border-stroke border-l-red-600 bg-surface px-4 py-3 text-sm">
          The overview counts did not load.
          <button type="button" class="ml-2 text-brand-700" onClick={() => void overview.refetch()}>Try again</button>
        </div>
      </Show>

      <div class="hr-kpis">
        <A href="/app/hr/employees" class={kpiClass}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("active_employees") === 0 }}>{overview.data ? count("active_employees") : "—"}</p>
          <p class="text-sm text-text-secondary">Headcount</p>
        </A>
        <Show when={mode.enabled()}>
          <A href="/app/hr/deployments" class={kpiClass}>
            <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": deployed() === 0 }}>{assignments.data ? deployed() : "—"}</p>
            <p class="text-sm text-text-secondary">Deployed</p>
            <p class="mt-1 text-xs text-text-secondary">Open placements</p>
          </A>
          <A href="/app/hr/workforce" class={kpiClass}>
            <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": (workforce.data?.unassigned ?? []).length === 0 }}>{workforce.data ? (workforce.data.unassigned ?? []).length : "—"}</p>
            <p class="text-sm text-text-secondary">Not on a site</p>
          </A>
          <A href="/app/hr/manpower-requests" class={kpiClass}>
            <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": openManpower().length === 0 }}>{manpower.data ? openManpower().length : "—"}</p>
            <p class="text-sm text-text-secondary">Open manpower requests</p>
          </A>
        </Show>
        <A href="/app/hr/applicants" class={kpiClass}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("applicants") === 0 }}>{overview.data ? count("applicants") : "—"}</p>
          <p class="text-sm text-text-secondary">Applicants</p>
        </A>
        <A href="/app/hr/leave" class={kpiClass} classList={{ "border-l-[3px] border-l-amber-600": count("leave_waiting") > 0 }}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("leave_waiting") === 0 }}>{overview.data ? count("leave_waiting") : "—"}</p>
          <p class="text-sm text-text-secondary">Leave waiting</p>
        </A>
        <A href="/app/hr/requests" class={kpiClass} classList={{ "border-l-[3px] border-l-amber-600": count("requests_waiting") > 0 }}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("requests_waiting") === 0 }}>{overview.data ? count("requests_waiting") : "—"}</p>
          <p class="text-sm text-text-secondary">Requests waiting</p>
        </A>
        <A href="/app/hr/workplace-problems" class={kpiClass} classList={{ "border-l-[3px] border-l-red-600": count("late_workplace_problems") > 0 }}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("late_workplace_problems") === 0, "text-red-700": count("late_workplace_problems") > 0 }}>{overview.data ? count("late_workplace_problems") : "—"}</p>
          <p class="text-sm text-text-secondary">Late problems</p>
        </A>
        <A href="/app/hr/evaluations" class={kpiClass} classList={{ "border-l-[3px] border-l-amber-600": count("evaluations_due") > 0 }}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": count("evaluations_due") === 0 }}>{overview.data ? count("evaluations_due") : "—"}</p>
          <p class="text-sm text-text-secondary">Evaluations due</p>
        </A>
        <A href="/app/hr/compliance" class={kpiClass} classList={{ "border-l-[3px] border-l-red-600": expiredDocs().length > 0 }}>
          <p class="text-2xl font-bold tabular-nums" classList={{ "text-slate-300": expiredDocs().length === 0, "text-red-700": expiredDocs().length > 0 }}>{documents.data ? expiredDocs().length : "—"}</p>
          <p class="text-sm text-text-secondary">Documents past date</p>
        </A>
        <A href="/app/hr/payroll-runs" class={kpiClass}>
          <p class="text-lg font-bold">{periods.data?.[0] ? labelize(periods.data[0].status) : "—"}</p>
          <p class="text-sm text-text-secondary">Latest pay period</p>
          <p class="mt-1 text-xs text-text-secondary">{periods.data?.[0]?.period_label ?? "No period"}</p>
        </A>
      </div>

      <div class="hr-widgets mt-4">
        <Show when={shown("attn")}>
          <section class="hr-span rounded-lg border border-stroke bg-surface p-4" aria-label="Needs your attention">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-semibold">Needs your attention</h2>
              <span class="rounded-full border border-stroke px-2 py-0.5 text-xs">{queue().length}</span>
              <div class="ml-auto flex flex-wrap gap-1">
                <For each={[["", "All"], ["case", "Cases"], ["eval", "Evaluations"], ["req", "Requests"], ["mr", "Manpower"], ["time", "Time"], ["pay", "Payroll"], ["doc", "Documents"]]}>
                  {([id, label]) => (
                    <button type="button" class="rounded-full border px-2 py-0.5 text-xs" classList={{ "border-brand-600 text-brand-700": queueFilter() === id, "border-stroke": queueFilter() !== id }} onClick={() => setQueueFilter(id)}>{label}</button>
                  )}
                </For>
              </div>
            </div>
            <Show when={!overview.isPending} fallback={<p class="text-sm text-text-secondary">Loading counts…</p>}>
              <For each={queue()} fallback={<p class="text-sm text-text-secondary">Nothing is waiting for this filter.</p>}>
                {(item) => (
                  <div class="flex flex-wrap items-center gap-2 border-t border-stroke py-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium">{item.title}</p>
                      <p class="text-xs text-text-secondary">{item.detail}</p>
                    </div>
                    <span class="text-xs" classList={{ "text-red-700": item.tone === "danger", "text-amber-700": item.tone === "warn", "text-text-secondary": item.tone === "neutral" }}>{item.tone === "danger" ? "Late" : item.tone === "warn" ? "Waiting" : "Open"}</span>
                    <A href={item.href} class="rounded-lg border border-stroke px-2 text-sm">Open</A>
                  </div>
                )}
              </For>
            </Show>
          </section>
        </Show>

        <Show when={mode.enabled() && shown("dep")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Deployment by client">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Deployment by client</h2>
              <A href="/app/hr/deployments" class="text-sm text-brand-700">Roster</A>
            </div>
            <For each={byClient()} fallback={<p class="text-sm text-text-secondary">No open placements.</p>}>
              {(row) => (
                <div class="mb-2 grid grid-cols-[minmax(0,1fr)_72px_2rem] items-center gap-2 text-sm">
                  <A href="/app/hr/clients" class="truncate text-brand-700">{row.name}</A>
                  <span class="hr-bar"><i style={{ width: `${Math.round((row.count / Math.max(1, byClient()[0]?.count ?? 1)) * 100)}%` }} /></span>
                  <b class="text-right tabular-nums">{row.count}</b>
                </div>
              )}
            </For>
          </section>
        </Show>

        <Show when={mode.enabled() && shown("ind")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Deployed by industry">
            <h2 class="mb-2 text-sm font-semibold">Deployed by industry</h2>
            <For each={byIndustry()} fallback={<p class="text-sm text-text-secondary">No one is placed on a site yet.</p>}>
              {(row) => (
                <div class="mb-2 grid grid-cols-[minmax(0,1fr)_72px_2rem] items-center gap-2 text-sm">
                  <span class="truncate">{row.name}</span>
                  <span class="hr-bar"><i style={{ width: `${Math.round((row.count / Math.max(1, byIndustry()[0]?.count ?? 1)) * 100)}%` }} /></span>
                  <b class="text-right tabular-nums">{row.count}</b>
                </div>
              )}
            </For>
          </section>
        </Show>

        <Show when={shown("fun")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Applicant pipeline">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Applicant pipeline</h2>
              <A href="/app/hr/applicants" class="text-sm text-brand-700">Applicants</A>
            </div>
            <For each={pipeline()}>
              {(row) => (
                <div class="mb-2">
                  <div class="hr-bar" style={{ width: `${Math.max(12, Math.round((row.count / pipelineMax()) * 100))}%` }}>
                    <i style={{ width: "100%" }} />
                  </div>
                  <p class="text-xs text-text-secondary"><b class="text-sm text-text-primary">{applications.data ? row.count : "—"}</b> {row.label}</p>
                </div>
              )}
            </For>
          </section>
        </Show>

        <Show when={mode.enabled() && shown("mr")}>
          <section class="hr-span rounded-lg border border-stroke bg-surface p-4" aria-label="Open manpower requests">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Open manpower requests</h2>
              <A href="/app/hr/manpower-requests" class="text-sm text-brand-700">All requests</A>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-xs uppercase text-text-secondary"><th class="py-1">Client</th><th>Site</th><th>Details</th><th class="text-right">Slots</th></tr></thead>
                <tbody>
                  <For each={openManpower().slice(0, 8)} fallback={<tr><td class="py-2 text-text-secondary" colspan="4">No open requests.</td></tr>}>
                    {(row) => (
                      <tr class="border-t border-stroke">
                        <td class="py-1.5">{row.client_name}</td>
                        <td>{row.site_name}</td>
                        <td class="max-w-[16rem] truncate">{row.details || "—"}</td>
                        <td class="text-right tabular-nums">{row.headcount}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </Show>

        <Show when={mode.enabled() && shown("dtr")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Client time files">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Client time files</h2>
              <A href="/app/hr/attendance/client-dtr" class="text-sm text-brand-700">Client DTR</A>
            </div>
            <For each={visibleTime()} fallback={<p class="text-sm text-text-secondary">No time files yet.</p>}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  {row.client_name} · {row.site_name}
                  <span class="text-text-secondary"> · {row.period_start} – {row.period_end} · {labelize(row.status)}</span>
                </p>
              )}
            </For>
          </section>
        </Show>

        <Show when={shown("pay")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Latest pay period">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Latest pay period</h2>
              <A href="/app/hr/payroll-runs" class="text-sm text-brand-700">Payroll</A>
            </div>
            <Show when={periods.data?.[0]} fallback={<p class="text-sm text-text-secondary">No pay period yet.</p>}>
              {(period) => (
                <p class="text-sm">
                  {period().period_label}
                  <span class="text-text-secondary"> · {period().period_start} – {period().period_end} · {labelize(period().status)}</span>
                </p>
              )}
            </Show>
            <p class="mt-2 text-xs text-text-secondary">Pay amounts stay on the payroll pages.</p>
          </section>
        </Show>

        <Show when={mode.enabled() && shown("bill")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Client bills">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Client bills</h2>
              <A href="/app/hr/client-billing" class="text-sm text-brand-700">Billing</A>
            </div>
            <For each={visibleBills()} fallback={<p class="text-sm text-text-secondary">No client bills yet.</p>}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  {row.client_name} · {row.site_name}
                  <span class="text-text-secondary"> · {row.period_start} – {row.period_end} · </span>
                  <span class="tabular-nums">{formatAmount(row.total)}</span>
                </p>
              )}
            </For>
            <p class="mt-2 text-xs text-text-secondary">This is the amount charged to the client. It is not money collected, and it is not worker pay.</p>
          </section>
        </Show>

        <Show when={shown("cal")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Leave this week">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Leave this week</h2>
              <A href="/app/hr/leave" class="text-sm text-brand-700">Leave</A>
            </div>
            <p class="mb-2 text-xs text-text-secondary">{week.start} – {week.end}</p>
            <For each={leaveThisWeek()} fallback={<p class="text-sm text-text-secondary">No submitted or approved leave overlaps this week in the latest 100 requests.</p>}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  {row.employee_name} · {row.leave_name}
                  <span class="text-text-secondary"> · {row.date_from} – {row.date_to} · {labelize(row.status)}</span>
                </p>
              )}
            </For>
          </section>
        </Show>

        <Show when={shown("comp")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Document dates">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Document dates</h2>
              <A href="/app/hr/compliance" class="text-sm text-brand-700">Documents</A>
            </div>
            <For each={[...expiredDocs(), ...expiringDocs()].slice(0, 8)} fallback={<p class="text-sm text-text-secondary">No document is past its date or due within 30 days.</p>}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  {row.employee_name} · {row.title || row.doc_type}
                  <span classList={{ "text-red-700": row.late, "text-text-secondary": !row.late }}> · {row.expires_on || "No date"}{row.late ? " · past date" : ""}</span>
                </p>
              )}
            </For>
          </section>
        </Show>

        <Show when={shown("ev")}>
          <section class="rounded-lg border border-stroke bg-surface p-4" aria-label="Holidays and cut-offs">
            <h2 class="mb-2 text-sm font-semibold">Holidays and cut-offs</h2>
            <For each={comingHolidays()} fallback={<p class="text-sm text-text-secondary">No later holiday is stored for this year.</p>}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  <A href="/app/hr/attendance/setup" class="text-brand-700">{row.name}</A>
                  <span class="text-text-secondary"> · {row.holiday_date} · {labelize(row.holiday_type)}</span>
                </p>
              )}
            </For>
            <For each={comingCutoffs()}>
              {(row) => (
                <p class="border-t border-stroke py-1.5 text-sm">
                  <A href="/app/hr/attendance/setup" class="text-brand-700">{row.label}</A>
                  <span class="text-text-secondary"> · {row.cutoff_start} – {row.cutoff_end}{row.pay_date ? ` · pay ${row.pay_date}` : ""}</span>
                </p>
              )}
            </For>
          </section>
        </Show>
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
          <button type="button" class="rounded-lg bg-brand-600 px-4 text-sm text-white disabled:opacity-60" disabled={busy()} onClick={() => void runSample("/api/v1/hr/sample-data", "Sample HR data added.")}>Seed</button>
          <button type="button" class="rounded-lg border border-stroke px-4 text-sm disabled:opacity-60" disabled={busy()} onClick={() => setConfirmRemove(true)}>Remove sample data</button>
        </div>
        <Show when={confirmRemove()}>
          <div class="mt-3 rounded-lg border border-stroke p-3">
            <p class="text-sm">Remove the sample HR batch? This deletes only that batch.</p>
            <div class="mt-2 flex gap-2">
              <button type="button" class="rounded-lg border border-stroke px-3 text-sm" onClick={() => setConfirmRemove(false)}>Cancel</button>
              <button type="button" class="rounded-lg bg-brand-600 px-3 text-sm text-white disabled:opacity-60" disabled={busy()} onClick={() => { setConfirmRemove(false); void runSample("/api/v1/hr/sample-data/retract", "Sample HR data removed."); }}>Remove sample data</button>
            </div>
          </div>
        </Show>
      </section>

      <Show when={customize()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Customize dashboard" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") setCustomize(false); }}>
          <div class="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border border-stroke bg-surface p-4">
            <div class="mb-2 flex items-center justify-between">
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
