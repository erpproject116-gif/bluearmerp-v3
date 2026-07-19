import { For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type CaseRow = {
  id: number; employee_no?: string; employee_name?: string; status: string;
  pending_tasks: number; overdue_tasks: number; started_at: string;
};

export default function HireOnboardingPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const cases = createQuery(() => ({
    queryKey: ["hr-hire-onboarding"],
    queryFn: async () => (await apiFetch<CaseRow[]>("/api/v1/hr/hire-onboarding/cases")).data ?? [],
  }));

  const detail = createQuery(() => ({
    queryKey: ["hr-hire-onboarding-detail", cases.data?.[0]?.id],
    enabled: !!(cases.data?.[0]?.id),
    queryFn: async () => {
      const id = cases.data![0].id;
      return (await apiFetch<{ case: CaseRow; tasks: { id: number; title: string; status: string; due_date?: string; task_kind: string }[] }>(
        `/api/v1/hr/hire-onboarding/cases/${id}`,
      )).data!;
    },
  }));

  const complete = async (taskId: number) => {
    const res = await apiFetch(`/api/v1/hr/hire-onboarding/tasks/${taskId}/complete`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Task completed.");
    void qc.invalidateQueries({ queryKey: ["hr-hire-onboarding"] });
    void qc.invalidateQueries({ queryKey: ["hr-hire-onboarding-detail"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Hire onboarding</h1>
      <p class="mb-6 text-sm text-text-secondary">
        New-hire checklists (distinct from workspace ERP onboarding). Cases auto-spawn when an active employee is created.
      </p>

      <section class="mb-6 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="mb-3 text-lg font-medium">Board</h2>
        <For each={cases.data ?? []} fallback={<p class="text-sm text-text-secondary">No onboarding cases yet.</p>}>
          {(c) => (
            <div class="mb-2 border-b border-slate-100 py-2 text-sm">
              <p class="font-medium">{c.employee_no} — {c.employee_name}</p>
              <p class="text-text-secondary">
                {c.status} · pending {c.pending_tasks}
                <Show when={c.overdue_tasks > 0}> · <span class="text-amber-800">overdue {c.overdue_tasks}</span></Show>
              </p>
            </div>
          )}
        </For>
      </section>

      <Show when={detail.data}>
        {(d) => (
          <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <h2 class="mb-3 text-lg font-medium">Tasks — {d().case.employee_name}</h2>
            <For each={d().tasks}>
              {(t) => (
                <div class="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm">
                  <div>
                    <p class="font-medium">{t.title}</p>
                    <p class="text-text-secondary">{t.task_kind} · due {t.due_date ?? "—"} · {t.status}</p>
                  </div>
                  <Show when={t.status === "pending"}>
                    <button type="button" class="text-xs text-brand-700" onClick={() => void complete(t.id)}>Mark done</button>
                  </Show>
                </div>
              )}
            </For>
          </section>
        )}
      </Show>
    </HrLayout>
  );
}
