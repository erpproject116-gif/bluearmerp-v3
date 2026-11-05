import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, type HrBadgeTone } from "./HrUi";

type CaseRow = {
  id: number;
  employee_id?: number;
  employee_no?: string;
  employee_name?: string;
  status: string;
  pending_tasks: number;
  overdue_tasks: number;
  started_at: string;
};

type TaskRow = { id: number; title: string; status: string; due_date?: string; task_kind: string };

const BOARD_COLUMNS: { id: string; label: string; color: string; match: (c: CaseRow) => boolean }[] = [
  {
    id: "active",
    label: "In progress",
    color: "#2563EB",
    match: (c) => c.status !== "completed" && c.status !== "done" && c.overdue_tasks === 0,
  },
  {
    id: "overdue",
    label: "Overdue",
    color: "#D97706",
    match: (c) => c.status !== "completed" && c.status !== "done" && c.overdue_tasks > 0,
  },
  {
    id: "done",
    label: "Ready / completed",
    color: "#15803D",
    match: (c) => c.status === "completed" || c.status === "done",
  },
];

function caseTone(c: CaseRow): HrBadgeTone {
  if (c.status === "completed" || c.status === "done") return "success";
  if (c.overdue_tasks > 0) return "danger";
  return "info";
}

function caseLabel(c: CaseRow) {
  if (c.status === "completed" || c.status === "done") return "Ready to deploy";
  if (c.overdue_tasks > 0) return `Overdue · ${c.overdue_tasks}`;
  return c.status.replaceAll("_", " ") || "In progress";
}

function taskTone(status: string): HrBadgeTone {
  if (status === "done" || status === "completed") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function progressPct(pending: number, overdue: number) {
  // Without total tasks on the list payload, show inverted pending pressure: more pending = less progress estimate.
  const pressure = pending + overdue;
  if (pressure <= 0) return 100;
  return Math.max(8, Math.min(92, 100 - pressure * 12));
}

export default function HireOnboardingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [caseId, setCaseId] = createSignal<number | null>(null);
  const [search, setSearch] = createSignal("");
  const [colFilter, setColFilter] = createSignal("");

  const cases = createQuery(() => ({
    queryKey: ["hr-hire-onboarding"],
    queryFn: async () => (await apiFetch<CaseRow[]>("/api/v1/hr/hire-onboarding/cases")).data ?? [],
  }));

  const detail = createQuery(() => ({
    queryKey: ["hr-hire-onboarding-detail", caseId()],
    enabled: caseId() != null,
    queryFn: async () => {
      const id = caseId();
      return (
        await apiFetch<{ case: CaseRow; tasks: TaskRow[] }>(`/api/v1/hr/hire-onboarding/cases/${id}`)
      ).data!;
    },
  }));

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const col = colFilter();
    return (cases.data ?? []).filter((c) => {
      if (col) {
        const def = BOARD_COLUMNS.find((x) => x.id === col);
        if (def && !def.match(c)) return false;
      }
      if (!q) return true;
      return (
        (c.employee_name || "").toLowerCase().includes(q) ||
        (c.employee_no || "").toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
      );
    });
  });

  const board = createMemo(() =>
    BOARD_COLUMNS.map((col) => ({
      ...col,
      items: filtered().filter((c) => col.match(c)),
    })),
  );

  const complete = async (taskId: number) => {
    const res = await apiFetch(`/api/v1/hr/hire-onboarding/tasks/${taskId}/complete`, { method: "POST", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Task completed.");
    void qc.invalidateQueries({ queryKey: ["hr-hire-onboarding"] });
    void qc.invalidateQueries({ queryKey: ["hr-hire-onboarding-detail"] });
  };

  const openCase = (id: number) => setCaseId(id);

  return (
    <HrLayout>
      <HrPageHead
        title="Hire onboarding"
        subtitle="Checklists start automatically when an active employee is created. Track each new hire across onboarding stages."
        actions={
          <div class="hr-actions">
            <A class="hr-btn" href="/app/hr/applicants">
              Applicants ↗
            </A>
            <A class="hr-btn" href="/app/hr/workforce">
              Employee board ↗
            </A>
            <A class="hr-btn" href="/app/hr/employees">
              Open 201 file ↗
            </A>
            <A class="hr-btn" href="/app/hr/compliance">
              Compliance documents ↗
            </A>
            <A class="hr-btn hr-btn-primary" href="/app/hr/deployments">
              Assign deployment →
            </A>
          </div>
        }
      />

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <input
          class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
          placeholder="Search employee # or name…"
          aria-label="Search"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <div class="hr-seg" role="group" aria-label="Board filter">
          <button type="button" classList={{ on: colFilter() === "" }} onClick={() => setColFilter("")}>
            All
          </button>
          <For each={BOARD_COLUMNS}>
            {(col) => (
              <button type="button" classList={{ on: colFilter() === col.id }} onClick={() => setColFilter(col.id)}>
                {col.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={!cases.isPending} fallback={<p class="text-sm text-text-secondary">Loading onboarding cases…</p>}>
        <div class="hr-onb-board flex gap-3 overflow-x-auto pb-2">
          <For each={board()}>
            {(col) => (
              <section class="hr-onb-col flex min-w-[240px] flex-1 flex-col rounded-xl border border-stroke bg-panel">
                <header class="flex items-center gap-2 border-b border-stroke px-3 py-2">
                  <span class="inline-block h-2.5 w-2.5 rounded-full" style={{ background: col.color }} />
                  <h3 class="text-sm font-semibold">{col.label}</h3>
                  <HrBadge tone="neutral">{col.items.length}</HrBadge>
                </header>
                <div class="space-y-2 p-2">
                  <For each={col.items} fallback={<div class="hr-wempty py-6">No cases</div>}>
                    {(c) => (
                      <button
                        type="button"
                        class="hr-kb-card block w-full rounded-lg border border-stroke bg-surface p-3 text-left text-sm hover:border-brand-500"
                        classList={{ "ring-2 ring-brand-500": caseId() === c.id }}
                        onClick={() => openCase(c.id)}
                      >
                        <div class="hr-who mb-1">
                          <div class="hr-avatar" aria-hidden="true">{initials(c.employee_name || "?")}</div>
                          <div class="min-w-0">
                            <b class="block truncate">{c.employee_name}</b>
                            <span class="hr-muted">{c.employee_no}</span>
                          </div>
                        </div>
                        <div class="mb-2">
                          <HrBadge tone={caseTone(c)}>{caseLabel(c)}</HrBadge>
                        </div>
                        <div class="hr-bar mb-1" title="Checklist progress (estimate)">
                          <i style={{ width: `${progressPct(c.pending_tasks, c.overdue_tasks)}%` }} />
                        </div>
                        <p class="hr-muted">
                          Checklist · pending {c.pending_tasks}
                          <Show when={c.overdue_tasks > 0}>
                            {" "}
                            · <span class="text-amber-800">overdue {c.overdue_tasks}</span>
                          </Show>
                        </p>
                        <p class="hr-muted">Started {c.started_at?.slice(0, 10) || "—"}</p>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>

      <Show when={(cases.data ?? []).length === 0 && !cases.isPending}>
        <HrEmpty title="No onboarding cases yet" hint="Cases auto-spawn when an active employee is created." />
      </Show>

      <Show when={caseId() != null}>
        <div
          class="fixed inset-0 z-[60] flex justify-end bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding checklist"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setCaseId(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCaseId(null);
          }}
        >
          <div class="hr-side-panel flex h-full w-full max-w-md flex-col border-l border-stroke bg-surface shadow-xl">
            <header class="flex items-center justify-between gap-2 border-b border-stroke px-4 py-3">
              <div>
                <h3 class="text-sm font-semibold">
                  Onboarding checklist · {detail.data?.case.employee_name ?? "…"}
                </h3>
                <Show when={detail.data?.case}>
                  {(c) => <HrBadge tone={caseTone(c())}>{caseLabel(c())}</HrBadge>}
                </Show>
              </div>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setCaseId(null)}>
                ✕
              </button>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              <Show when={detail.isPending}>
                <p class="text-sm text-text-secondary">Loading tasks…</p>
              </Show>
              <Show when={detail.data}>
                {(d) => (
                  <>
                    <ol class="hr-timeline mb-4">
                      <For each={d().tasks}>
                        {(t) => (
                          <li>
                            <div class="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <b>{t.title}</b>
                                <span class="hr-muted block">
                                  {t.task_kind} · due {t.due_date ?? "—"}
                                </span>
                              </div>
                              <HrBadge tone={taskTone(t.status)}>{t.status}</HrBadge>
                            </div>
                            <Show when={t.status === "pending"}>
                              <button type="button" class="mt-1 text-xs font-semibold text-brand-700" onClick={() => void complete(t.id)}>
                                Mark done
                              </button>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ol>
                    <div class="rounded-lg border border-dashed border-stroke bg-panel p-3 text-sm">
                      <b>Ready to deploy</b>
                      <p class="hr-muted mt-1">
                        Mockup stage gates (equipment / gov’t IDs / orientation) need backend. Use Assign deployment when the
                        checklist is clear.
                      </p>
                      <A class="hr-btn hr-btn-sm mt-2" href="/app/hr/deployments">
                        Assign deployment →
                      </A>
                    </div>
                  </>
                )}
              </Show>
            </div>
            <footer class="flex justify-end gap-2 border-t border-stroke px-4 py-3">
              <button type="button" class="hr-btn" onClick={() => setCaseId(null)}>
                Close
              </button>
            </footer>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
