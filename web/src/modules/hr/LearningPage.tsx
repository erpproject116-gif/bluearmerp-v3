import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPerformanceTabs } from "./HrPerformanceTabs";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";

type Course = {
  id: number;
  code: string;
  title: string;
  summary?: string;
  is_mandatory: boolean;
  pass_mark: number;
};
type Assignment = {
  id: number;
  course_id?: number;
  course_code?: string;
  course_title?: string;
  employee_no?: string;
  employee_name?: string;
  status: string;
  due_date?: string | null;
};

type InnerTab = "c" | "e";

function statusLabel(status: string) {
  switch (status) {
    case "assigned":
      return "Enrolled";
    case "in_progress":
      return "In progress";
    case "passed":
      return "Completed";
    case "failed":
      return "Failed";
    case "expired":
      return "Expired";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "—";
  }
}

function statusTone(status: string): HrBadgeTone {
  if (status === "passed") return "success";
  if (status === "in_progress") return "warning";
  if (status === "failed" || status === "expired") return "danger";
  return "neutral";
}

export default function LearningPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = createSignal<InnerTab>("c");
  const [courseId, setCourseId] = createSignal("");
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [due, setDue] = createSignal("");
  const [courseOpen, setCourseOpen] = createSignal(false);
  const [assignOpen, setAssignOpen] = createSignal(false);
  const [courseCode, setCourseCode] = createSignal("");
  const [courseTitle, setCourseTitle] = createSignal("");
  const [courseSummary, setCourseSummary] = createSignal("");
  const [passMark, setPassMark] = createSignal("70");
  const [mandatory, setMandatory] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const courses = createQuery(() => ({
    queryKey: ["hr-courses"],
    queryFn: async () => (await apiFetch<Course[]>("/api/v1/hr/learning/courses")).data ?? [],
  }));
  const assignments = createQuery(() => ({
    queryKey: ["hr-learning-assignments"],
    queryFn: async () => (await apiFetch<Assignment[]>("/api/v1/hr/learning/assignments")).data ?? [],
  }));
  const compliance = createQuery(() => ({
    queryKey: ["hr-learning-compliance"],
    queryFn: async () => (await apiFetch<Assignment[]>("/api/v1/hr/learning/compliance")).data ?? [],
  }));

  const courseCards = createMemo(() => {
    const assigns = assignments.data ?? [];
    return (courses.data ?? []).map((c) => {
      const rows = assigns.filter((a) => a.course_id === c.id || a.course_code === c.code);
      const done = rows.filter((a) => a.status === "passed").length;
      const pct = rows.length > 0 ? Math.round((done / rows.length) * 100) : 0;
      return { ...c, enrolled: rows.length, completed: done, pct };
    });
  });

  const enrollmentRows = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (assignments.data ?? []).filter((a) => {
      if (statusFilter()) {
        const want = statusFilter();
        if (want === "Enrolled" && a.status !== "assigned") return false;
        if (want === "In progress" && a.status !== "in_progress") return false;
        if (want === "Completed" && a.status !== "passed") return false;
        if (!["Enrolled", "In progress", "Completed"].includes(want) && a.status !== want) return false;
      }
      if (!q) return true;
      return (
        (a.employee_name || "").toLowerCase().includes(q) ||
        (a.employee_no || "").toLowerCase().includes(q) ||
        (a.course_title || "").toLowerCase().includes(q) ||
        (a.course_code || "").toLowerCase().includes(q)
      );
    });
  });

  const assign = async () => {
    if (!courseId() || !empId()) return toast.warning("Course and employee required.");
    setBusy(true);
    const res = await apiFetch("/api/v1/hr/learning/assignments", {
      method: "POST",
      body: JSON.stringify({ course_id: Number(courseId()), employee_id: empId(), due_date: due() || undefined }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Failed.");
    toast.success("Enrolled.");
    setAssignOpen(false);
    setDue("");
    void qc.invalidateQueries({ queryKey: ["hr-learning-assignments"] });
    void qc.invalidateQueries({ queryKey: ["hr-learning-compliance"] });
  };

  const createCourse = async () => {
    if (!courseCode().trim() || !courseTitle().trim()) return toast.warning("Code and title required.");
    const mark = Number(passMark());
    setBusy(true);
    const res = await apiFetch("/api/v1/hr/learning/courses", {
      method: "POST",
      body: JSON.stringify({
        code: courseCode().trim(),
        title: courseTitle().trim(),
        summary: courseSummary().trim(),
        is_mandatory: mandatory(),
        pass_mark: mark > 0 ? mark : undefined,
      }),
    });
    setBusy(false);
    if (!res.success) return toast.warning(res.message ?? "Could not create the course.");
    toast.success("Course created.");
    setCourseCode("");
    setCourseTitle("");
    setCourseSummary("");
    setPassMark("70");
    setMandatory(false);
    setCourseOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-courses"] });
  };

  return (
    <HrLayout>
      <HrPerformanceTabs />
      <HrPageHead
        title="Learning"
        subtitle="Courses, enrollments and completion."
        actions={
          <div class="hr-actions">
            <button type="button" class="hr-btn" onClick={() => setAssignOpen(true)}>
              Enroll…
            </button>
            <button type="button" class="hr-btn hr-btn-primary" onClick={() => setCourseOpen(true)}>
              + New course
            </button>
          </div>
        }
      />

      <div class="hr-tabs" role="tablist" aria-label="Learning sections">
        <button type="button" role="tab" classList={{ on: tab() === "c" }} aria-selected={tab() === "c"} onClick={() => setTab("c")}>
          Courses
        </button>
        <button type="button" role="tab" classList={{ on: tab() === "e" }} aria-selected={tab() === "e"} onClick={() => setTab("e")}>
          Enrollments
        </button>
      </div>

      <Show when={tab() === "c"}>
        <div class="hr-course-grid">
          <For each={courseCards()} fallback={<HrEmpty title="No courses" hint="Create a course to start enrollments." />}>
            {(c) => (
              <article class="hr-course-card">
                <h3>{c.title}</h3>
                <p class="hr-muted text-sm">{c.summary || c.code}{c.is_mandatory ? " · mandatory" : ""}</p>
                <div class="hr-prog mt-3" style={{ width: "100%" }} title={`${c.pct}% completed`}>
                  <i style={{ width: `${c.pct}%` }} />
                </div>
                <div class="hr-muted mt-1 text-xs">
                  {c.enrolled === 0 ? "No enrollments yet" : `${c.pct}% of enrolled completed (${c.completed}/${c.enrolled})`}
                </div>
              </article>
            )}
          </For>
        </div>

        <Show when={(compliance.data ?? []).length > 0}>
          <section class="hr-w s12 mt-4" aria-label="Compliance">
            <header>
              <h3>Compliance gaps</h3>
              <span class="grow" />
              <HrBadge tone="warning">{(compliance.data ?? []).length}</HrBadge>
            </header>
            <ul class="hr-aq">
              <For each={compliance.data ?? []}>
                {(a) => (
                  <li>
                    <span class="t">
                      <b>
                        {a.employee_name} · {a.course_title}
                      </b>
                      <span class="xs">
                        {statusLabel(a.status)} · due {a.due_date ?? "—"}
                      </span>
                    </span>
                    <HrBadge tone={statusTone(a.status)}>{statusLabel(a.status)}</HrBadge>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </Show>

      <Show when={tab() === "e"}>
        <HrTcard
          toolbar={
            <>
              <input
                class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
                placeholder="Search employee or course…"
                aria-label="Search"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <select
                class="rounded-lg border border-stroke bg-surface px-2 text-sm"
                aria-label="Status"
                value={statusFilter()}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
              >
                <option value="">Status: All</option>
                <option value="Enrolled">Enrolled</option>
                <option value="In progress">In progress</option>
                <option value="Completed">Completed</option>
              </select>
            </>
          }
        >
          <div class="hr-tbl-wrap">
            <table class="hr-tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                <For
                  each={enrollmentRows()}
                  fallback={
                    <tr>
                      <td colspan="5">
                        <HrEmpty title="No matches" hint="Try a different search or clear the filters." />
                      </td>
                    </tr>
                  }
                >
                  {(a) => (
                    <tr>
                      <td>
                        <div class="font-semibold">{a.employee_name}</div>
                        <div class="hr-muted">{a.employee_no}</div>
                      </td>
                      <td>{a.course_title || a.course_code}</td>
                      <td>
                        <HrBadge tone={statusTone(a.status)}>{statusLabel(a.status)}</HrBadge>
                      </td>
                      <td>{a.due_date || "—"}</td>
                      <td>
                        <details class="hr-menu hr-rowmenu">
                          <summary class="hr-rowmenu-btn" aria-label="Row actions">
                            ⋯
                          </summary>
                          <div>
                            <button
                              type="button"
                              class="menu-item"
                              onClick={() => toast.warning("Mark complete needs a quiz attempt — use My HR / quiz flow.")}
                            >
                              Mark complete
                            </button>
                            <button type="button" class="menu-item" onClick={() => toast.warning("Unenroll is not available yet.")}>
                              Unenroll
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </HrTcard>
      </Show>

      <Show when={courseOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="New course">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New course</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setCourseOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Code">
                <input class={inputClass} value={courseCode()} onInput={(e) => setCourseCode(e.currentTarget.value)} placeholder="e.g. ORIENT" />
              </Field>
              <Field label="Title">
                <input class={inputClass} value={courseTitle()} onInput={(e) => setCourseTitle(e.currentTarget.value)} />
              </Field>
              <Field label="Description">
                <textarea class={inputClass} rows={3} value={courseSummary()} onInput={(e) => setCourseSummary(e.currentTarget.value)} />
              </Field>
              <Field label="Pass mark">
                <input class={inputClass} value={passMark()} onInput={(e) => setPassMark(e.currentTarget.value)} />
              </Field>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mandatory()} onChange={(e) => setMandatory(e.currentTarget.checked)} />
                Mandatory (required for compliance)
              </label>
              <p class="hr-muted text-xs">
                Required-for site/plant scope
              </p>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setCourseOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void createCourse()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={assignOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Enroll employees">
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Enroll employees</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setAssignOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Course">
                <select class={inputClass} value={courseId()} onChange={(e) => setCourseId(e.currentTarget.value)}>
                  <option value="">Select…</option>
                  <For each={courses.data ?? []}>
                    {(c) => (
                      <option value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <LookupCombo
                label="Employee"
                value={empLabel}
                selectedId={empId}
                onInput={setEmpLabel}
                onSelect={(o) => {
                  setEmpId(o.id);
                  setEmpLabel(o.label);
                }}
                onClear={() => {
                  setEmpId(null);
                  setEmpLabel("");
                }}
                fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
                placeholder="Search employees…"
              />
              <Field label="Due date">
                <input type="date" class={inputClass} value={due()} onInput={(e) => setDue(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setAssignOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={busy()} onClick={() => void assign()}>
                Enroll
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
