import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

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

const cards = [
  { key: "active_employees", label: "Active employees", href: "/app/hr/employees" },
  { key: "open_discipline_cases", label: "Open discipline cases", href: "/app/hr/discipline" },
  { key: "pending_leave", label: "Pending leave", href: "/app/hr/leave" },
  { key: "open_absence_alerts", label: "Open absenteeism alerts", href: "/app/hr/absenteeism" },
] as const;

const moreCards = [
  { key: "applicants", label: "Applicants", href: "/app/hr/applicants" },
  { key: "open_workplace_problems", label: "Open problems", href: "/app/hr/workplace-problems" },
  { key: "late_workplace_problems", label: "Late problems", href: "/app/hr/workplace-problems" },
  { key: "evaluations_due", label: "Evaluations due", href: "/app/hr/evaluations" },
  { key: "problems_closed_this_month", label: "Problems closed this month", href: "/app/hr/workplace-problems" },
  { key: "leave_waiting", label: "Leave waiting", href: "/app/hr/leave" },
  { key: "loans_waiting", label: "Loans waiting", href: "/app/hr/requests" },
  { key: "pay_questions_waiting", label: "Pay questions waiting", href: "/app/hr/requests" },
  { key: "requests_waiting", label: "Requests waiting", href: "/app/hr/requests" },
] as const;

export default function HrOverviewPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = createSignal(false);
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
      <h1 class="mb-1 text-2xl font-semibold">HR</h1>
      <p class="mb-6 text-sm text-text-secondary">
        Headcount and open work. Pay amounts stay on Payroll.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <For each={cards}>
          {(card) => (
            <A href={card.href} class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:bg-slate-50">
              <p class="text-sm text-text-secondary">{card.label}</p>
              <p class="mt-1 text-2xl font-semibold">{overview.data?.[card.key] ?? "—"}</p>
            </A>
          )}
        </For>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <For each={moreCards}>
          {(card) => (
            <A href={card.href} class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:bg-slate-50">
              <p class="text-sm text-text-secondary">{card.label}</p>
              <p class="mt-1 text-2xl font-semibold">{overview.data?.[card.key] ?? "—"}</p>
            </A>
          )}
        </For>
      </div>
      <A href="/app/hr/reports" class="mt-4 inline-block text-sm text-brand-700 hover:underline">
        Discipline report
      </A>
      <section class="mt-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-medium">Sample HR data</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Sample employees are excluded from a real payroll run while the batch exists. Remove deletes only the sample batch.
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
            onClick={() => void runSample("/api/v1/hr/sample-data/retract", "Sample HR data removed.")}
          >
            Remove sample data
          </button>
        </div>
      </section>
    </HrLayout>
  );
}
