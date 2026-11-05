import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { useManpowerMode } from "./manpowerMode";

type Site = { site_name: string; people: { employee_name: string }[] };
type Client = { id: number; name: string; sites: Site[] };
type Assignment = {
  id: number;
  employee_name: string;
  client_name: string;
  site_name: string;
  start_date: string;
  end_date: string;
};

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

const attentionCards = [
  { key: "late_workplace_problems", label: "Late problems", href: "/app/hr/workplace-problems" },
  { key: "leave_waiting", label: "Leave waiting", href: "/app/hr/leave" },
  { key: "evaluations_due", label: "Evaluations due", href: "/app/hr/evaluations" },
  { key: "requests_waiting", label: "Requests waiting", href: "/app/hr/requests" },
] as const;

const workforceCards = [
  { key: "active_employees", label: "Active employees", href: "/app/hr/employees" },
  { key: "applicants", label: "Applicants", href: "/app/hr/applicants" },
] as const;

const queueCards = [
  { key: "open_workplace_problems", label: "Open problems", href: "/app/hr/workplace-problems" },
  { key: "open_discipline_cases", label: "Open discipline cases", href: "/app/hr/discipline" },
  { key: "open_absence_alerts", label: "Open absenteeism alerts", href: "/app/hr/absenteeism" },
  { key: "pending_leave", label: "Pending leave", href: "/app/hr/leave" },
  { key: "loans_waiting", label: "Loans waiting", href: "/app/hr/requests" },
  { key: "pay_questions_waiting", label: "Pay questions waiting", href: "/app/hr/requests" },
  { key: "problems_closed_this_month", label: "Problems closed this month", href: "/app/hr/workplace-problems" },
] as const;

export default function HrOverviewPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const mode = useManpowerMode();
  const clients = createQuery(() => ({
    queryKey: ["hr-overview-clients"],
    enabled: mode.enabled(),
    queryFn: async () => (await apiFetch<Client[]>("/api/v1/hr/clients")).data ?? [],
  }));
  const assignments = createQuery(() => ({
    queryKey: ["hr-overview-assignments"],
    enabled: mode.enabled(),
    queryFn: async () => (await apiFetch<Assignment[]>("/api/v1/hr/assignments")).data ?? [],
  }));
  const [busy, setBusy] = createSignal(false);
  const [confirmRemove, setConfirmRemove] = createSignal(false);
  const overview = createQuery(() => ({
    queryKey: ["hr-overview"],
    queryFn: async () => (await apiFetch<Overview>("/api/v1/hr/overview")).data,
  }));

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
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">HR Overview</h1>
      <p class="mb-6 text-sm text-text-secondary">
        Headcount and open work. Pay amounts stay on Payroll.
      </p>
      <h2 class="mb-2 text-sm font-medium text-text-secondary">Needs attention</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <For each={attentionCards}>
          {(card) => {
            const value = () => overview.data?.[card.key] ?? 0;
            const alert = () => card.key === "late_workplace_problems" && value() > 0;
            const warn = () => card.key !== "late_workplace_problems" && value() > 0;
            return (
              <A
                href={card.href}
                class="rounded-xl border border-stroke bg-surface p-4 shadow-sm hover:bg-panel"
                classList={{ "border-l-4 border-l-red-600": alert(), "border-l-4 border-l-amber-600": warn() }}
              >
                <p class="text-2xl font-semibold" classList={{ "text-slate-300": value() === 0 }}>{overview.data ? value() : "—"}</p>
                <p class="text-sm text-text-secondary">{card.label}</p>
              </A>
            );
          }}
        </For>
      </div>
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 class="mb-2 text-sm font-medium text-text-secondary">Workforce</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={workforceCards}>
              {(card) => (
                <A href={card.href} class="rounded-xl border border-stroke bg-surface p-4 shadow-sm hover:bg-panel">
                  <p class="text-2xl font-semibold" classList={{ "text-slate-300": (overview.data?.[card.key] ?? 0) === 0 }}>{overview.data?.[card.key] ?? "—"}</p>
                  <p class="text-sm text-text-secondary">{card.label}</p>
                </A>
              )}
            </For>
          </div>
        </section>
        <section>
          <h2 class="mb-2 text-sm font-medium text-text-secondary">Queues</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={queueCards}>
              {(card) => (
                <A href={card.href} class="rounded-xl border border-stroke bg-surface p-4 shadow-sm hover:bg-panel">
                  <p class="text-2xl font-semibold" classList={{ "text-slate-300": (overview.data?.[card.key] ?? 0) === 0 }}>{overview.data?.[card.key] ?? "—"}</p>
                  <p class="text-sm text-text-secondary">{card.label}</p>
                </A>
              )}
            </For>
          </div>
        </section>
      </div>
      <Show when={mode.enabled()}>
        <div class="mt-6 grid gap-6 lg:grid-cols-2">
          <section class="rounded-xl border border-stroke bg-surface p-4">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-sm font-medium text-text-secondary">Clients</h2>
              <A href="/app/hr/clients" class="text-sm text-brand-700">Clients</A>
            </div>
            <Show when={!clients.isPending} fallback={<p class="text-sm text-text-secondary">Loading clients…</p>}>
              <For each={clients.data ?? []} fallback={<p class="text-sm text-text-secondary">No clients yet.</p>}>
                {(client) => (
                  <div class="border-t border-stroke py-2">
                    <A href="/app/hr/clients" class="text-sm font-medium text-brand-700">{client.name}</A>
                    <For each={client.sites ?? []}>
                      {(site) => (
                        <p class="text-sm text-text-secondary">
                          {site.site_name}
                          <Show when={(site.people ?? []).length > 0}>
                            {" · "}{(site.people ?? []).map((person) => person.employee_name).join(", ")}
                          </Show>
                        </p>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </section>
          <section class="rounded-xl border border-stroke bg-surface p-4">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-sm font-medium text-text-secondary">Deployments</h2>
              <A href="/app/hr/deployments" class="text-sm text-brand-700">Roster</A>
            </div>
            <Show when={!assignments.isPending} fallback={<p class="text-sm text-text-secondary">Loading deployments…</p>}>
              <For each={assignments.data ?? []} fallback={<p class="text-sm text-text-secondary">No deployments yet.</p>}>
                {(row) => (
                  <p class="border-t border-stroke py-2 text-sm">
                    {row.employee_name} · {row.client_name} · {row.site_name}
                    <span class="text-text-secondary"> · {row.start_date}{row.end_date ? ` – ${row.end_date}` : ""}</span>
                  </p>
                )}
              </For>
            </Show>
          </section>
        </div>
      </Show>
      <A href="/app/hr/reports" class="mt-4 inline-block text-sm text-brand-700 hover:underline">
        Discipline report
      </A>
      <section class="mt-6 rounded-xl border border-stroke bg-surface p-4 shadow-sm">
        <h2 class="text-lg font-medium">Sample HR data</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Sample employees are excluded from a real payroll run while the batch exists. Remove deletes only the sample batch.
          Sample attendance, payroll, and withholding are in 2099. Set the attendance month to 2099-01 and the government report year to 2099.
          The first client portal login is listed on Portal access.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            disabled={busy()}
            onClick={() => void runSample("/api/v1/hr/sample-data", "Sample HR data added.")}
          >
            Seed
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm disabled:opacity-60"
            disabled={busy()}
            onClick={() => setConfirmRemove(true)}
          >
            Remove sample data
          </button>
        </div>
        <Show when={confirmRemove()}>
          <div class="mt-3 rounded-lg border border-stroke p-3">
            <p class="text-sm">Remove the sample HR batch? This deletes only that batch.</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                onClick={() => setConfirmRemove(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                disabled={busy()}
                onClick={() => {
                  setConfirmRemove(false);
                  void runSample("/api/v1/hr/sample-data/retract", "Sample HR data removed.");
                }}
              >
                Remove sample data
              </button>
            </div>
          </div>
        </Show>
      </section>
    </HrLayout>
  );
}
